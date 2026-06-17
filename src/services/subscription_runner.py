# -*- coding: utf-8 -*-
"""Manual subscription push workflow: preview due stocks, analyze, deliver."""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from data_provider.base import canonical_stock_code
from src.config import Config
from src.core.trading_calendar import add_trading_days, get_effective_trading_date, is_market_open
from src.core.prediction_cycle import resolve_prediction_cycle
from src.enums import ReportType
from src.services.credit_service import CreditService
from src.services.history_service import HistoryService
from src.services.shared_analysis_service import SharedAnalysisService
from src.services.subscription_push import deliver_subscription_report
from src.storage import DatabaseManager, StockSubscription
from src.user_context import CurrentUser

logger = logging.getLogger(__name__)


@dataclass
class SubscriptionRunSummary:
    due_count: int = 0
    codes_analyzed: int = 0
    pushes_success: int = 0
    pushes_failed: int = 0
    pushes_skipped: int = 0
    credits_charged: int = 0
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "due_count": self.due_count,
            "codes_analyzed": self.codes_analyzed,
            "pushes_success": self.pushes_success,
            "pushes_failed": self.pushes_failed,
            "pushes_skipped": self.pushes_skipped,
            "credits_charged": self.credits_charged,
            "errors": list(self.errors),
        }


class SubscriptionRunner:
    _instance: Optional["SubscriptionRunner"] = None

    @classmethod
    def get_instance(cls) -> "SubscriptionRunner":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def collect_due_subscriptions(self) -> List[StockSubscription]:
        db = DatabaseManager.get_instance()
        due: List[StockSubscription] = []
        for row in db.list_active_stock_subscriptions():
            if row.next_push_on is None:
                continue
            effective_date = get_effective_trading_date(row.market)
            if row.next_push_on <= effective_date:
                due.append(row)
        return due

    def preview_due_today(self) -> Dict[str, Any]:
        """List stocks that need analysis/push today without side effects."""
        due_rows = self.collect_due_subscriptions()
        grouped: Dict[str, List[StockSubscription]] = defaultdict(list)
        for row in due_rows:
            grouped[row.code].append(row)

        db = DatabaseManager.get_instance()
        report_type = ReportType.SIMPLE.value
        stocks: List[Dict[str, Any]] = []

        for code, subscriptions in sorted(grouped.items()):
            market = subscriptions[0].market
            cycle = resolve_prediction_cycle(market)
            analysis_date = cycle.cycle_anchor_date
            market_open = is_market_open(market, analysis_date)
            existing = db.get_shared_analysis_run(code, analysis_date, report_type)
            has_cache = bool(existing is not None and existing.analysis_history_id)
            stocks.append({
                "code": code,
                "name": subscriptions[0].name or "",
                "market": market,
                "analysis_date": analysis_date.isoformat(),
                "prediction_target_date": cycle.prediction_target_date.isoformat(),
                "market_open": market_open,
                "due_subscription_count": len(subscriptions),
                "has_analysis_cache": has_cache,
                "subscriptions": [
                    {
                        "subscription_id": int(item.id),
                        "user_id": int(item.user_id),
                        "interval_days": int(item.interval_days),
                        "next_push_on": item.next_push_on.isoformat() if item.next_push_on else None,
                        "credits_per_push": int(item.credits_per_push),
                    }
                    for item in subscriptions
                ],
            })

        return {
            "due_subscription_count": len(due_rows),
            "stock_count": len(stocks),
            "stocks": stocks,
        }

    def analyze_due(self, codes: Optional[List[str]] = None) -> Dict[str, Any]:
        """Run shared analysis for due stocks. Does not push or charge credits."""
        due_rows = self._filter_due_rows(codes)
        grouped = self._group_by_code(due_rows)
        admin_user = self._admin_user()
        report_type = ReportType.SIMPLE
        results: List[Dict[str, Any]] = []
        analyzed = 0
        cached = 0
        failed = 0
        errors: List[str] = []

        for code, subscriptions in sorted(grouped.items()):
            market = subscriptions[0].market
            cycle = resolve_prediction_cycle(market)
            analysis_date = cycle.cycle_anchor_date

            db = DatabaseManager.get_instance()
            existing = db.get_shared_analysis_run(code, analysis_date, report_type.value)
            if existing is not None and existing.analysis_history_id:
                content = self._build_report_from_history(int(existing.analysis_history_id))
                if content:
                    cached += 1
                    results.append({
                        "code": code,
                        "status": "cached",
                        "cached": True,
                        "message": f"周期 {analysis_date} 已有分析缓存",
                    })
                    continue

            try:
                self._run_shared_analysis(
                    code=code,
                    market=market,
                    analysis_date=analysis_date,
                    report_type=report_type,
                    admin_user=admin_user,
                )
                analyzed += 1
                results.append({
                    "code": code,
                    "status": "success",
                    "cached": False,
                    "message": "分析完成",
                })
            except Exception as exc:
                failed += 1
                message = f"{code} 分析失败: {exc}"
                logger.error(message, exc_info=True)
                errors.append(message)
                results.append({
                    "code": code,
                    "status": "failed",
                    "cached": False,
                    "message": str(exc),
                })

        return {
            "due_subscription_count": len(due_rows),
            "stock_count": len(grouped),
            "codes_analyzed": analyzed,
            "codes_cached": cached,
            "codes_failed": failed,
            "results": results,
            "errors": errors,
        }

    def deliver_due(self, codes: Optional[List[str]] = None) -> Dict[str, Any]:
        """Push due subscriptions using today's shared analysis cache."""
        due_rows = self._filter_due_rows(codes)
        grouped = self._group_by_code(due_rows)
        summary = SubscriptionRunSummary(due_count=len(due_rows))
        platform_config = Config.get_instance()
        report_type = ReportType.SIMPLE

        for code, subscriptions in sorted(grouped.items()):
            market = subscriptions[0].market
            cycle = resolve_prediction_cycle(market)
            analysis_date = cycle.cycle_anchor_date

            db = DatabaseManager.get_instance()
            existing = db.get_shared_analysis_run(code, analysis_date, report_type.value)
            if existing is None or not existing.analysis_history_id:
                summary.errors.append(f"{code} 尚未完成今日分析，请先执行分析")
                continue

            report_content = self._build_report_from_history(int(existing.analysis_history_id))
            if not report_content:
                summary.errors.append(f"{code} 无法生成推送报告")
                continue

            self._fan_out_subscriptions(
                subscriptions=subscriptions,
                shared_run_id=int(existing.id),
                analysis_date=analysis_date,
                report_content=report_content,
                platform_config=platform_config,
                summary=summary,
            )

        logger.info(
            "订阅推送完成: due=%d success=%d failed=%d skipped=%d credits=%d",
            summary.due_count,
            summary.pushes_success,
            summary.pushes_failed,
            summary.pushes_skipped,
            summary.credits_charged,
        )
        return summary.to_dict()

    def _filter_due_rows(self, codes: Optional[List[str]]) -> List[StockSubscription]:
        due_rows = self.collect_due_subscriptions()
        if not codes:
            return due_rows
        normalized = {canonical_stock_code(code) for code in codes if canonical_stock_code(code)}
        return [row for row in due_rows if row.code in normalized]

    @staticmethod
    def _group_by_code(rows: List[StockSubscription]) -> Dict[str, List[StockSubscription]]:
        grouped: Dict[str, List[StockSubscription]] = defaultdict(list)
        for row in rows:
            grouped[row.code].append(row)
        return grouped

    @staticmethod
    def _admin_user() -> CurrentUser:
        admin_user_id = DatabaseManager.get_instance().ensure_default_admin_user()
        return CurrentUser(
            id=int(admin_user_id),
            username="admin",
            is_admin=True,
            account_type="system",
        )

    def _run_shared_analysis(
        self,
        *,
        code: str,
        market: str,
        analysis_date: date,
        report_type: ReportType,
        admin_user: CurrentUser,
        force_refresh: bool = False,
    ) -> None:
        outcome = SharedAnalysisService.get_instance().get_or_create(
            code=code,
            report_type=report_type,
            force_refresh=force_refresh,
            admin_user=admin_user,
            allow_intel_probe=not force_refresh,
            charge_probe_credits=False,
            single_stock_notify=False,
            query_source="subscription",
        )
        if outcome.shared_run is None or outcome.history_id is None:
            raise RuntimeError(f"{code} 分析未成功")

    def _ensure_shared_report(
        self,
        *,
        code: str,
        market: str,
        analysis_date: date,
        report_type: ReportType,
        admin_user: CurrentUser,
        platform_config: Config,
        allow_cached: bool = True,
        force_refresh: bool = False,
    ) -> Tuple[Optional[Any], Optional[str]]:
        del platform_config  # kept for call-site compatibility
        outcome = SharedAnalysisService.get_instance().get_or_create(
            code=code,
            report_type=report_type,
            force_refresh=force_refresh or not allow_cached,
            admin_user=admin_user,
            allow_intel_probe=allow_cached and not force_refresh,
            charge_probe_credits=False,
            single_stock_notify=False,
            query_source="subscription",
        )
        if outcome.shared_run is None or outcome.history_id is None:
            raise RuntimeError(f"{code} 分析未成功")
        content = self._build_report_from_history(int(outcome.history_id))
        return outcome.shared_run, content

    def _build_report_from_history(self, history_id: int) -> Optional[str]:
        try:
            return HistoryService().get_markdown_report(str(history_id))
        except Exception as exc:
            logger.error("生成订阅报告失败 history_id=%s: %s", history_id, exc, exc_info=True)
            return None

    def _fan_out_subscriptions(
        self,
        *,
        subscriptions: List[StockSubscription],
        shared_run_id: Optional[int],
        analysis_date: date,
        report_content: str,
        platform_config: Config,
        summary: SubscriptionRunSummary,
    ) -> None:
        db = DatabaseManager.get_instance()
        credit_service = CreditService.get_instance()

        for subscription in subscriptions:
            profile = db.get_notification_profile(int(subscription.user_id))
            email = (profile.notification_email if profile else "") or ""
            webhooks = (profile.webhook_urls if profile else "") or ""
            bearer = (profile.webhook_bearer_token if profile else "") or ""

            if not email.strip() and not webhooks.strip():
                db.create_subscription_push_log(
                    subscription_id=int(subscription.id),
                    user_id=int(subscription.user_id),
                    shared_run_id=shared_run_id,
                    code=subscription.code,
                    pushed_on=analysis_date,
                    channel="none",
                    status="skipped",
                    error_message="未配置推送方式",
                )
                summary.pushes_skipped += 1
                continue

            credits_needed = int(subscription.credits_per_push)
            balance = credit_service.get_balance(int(subscription.user_id))
            if balance < credits_needed:
                db.create_subscription_push_log(
                    subscription_id=int(subscription.id),
                    user_id=int(subscription.user_id),
                    shared_run_id=shared_run_id,
                    code=subscription.code,
                    pushed_on=analysis_date,
                    channel="none",
                    status="skipped",
                    error_message="积分不足",
                )
                summary.pushes_skipped += 1
                continue

            success, channel = deliver_subscription_report(
                content=report_content,
                platform_config=platform_config,
                notification_email=email,
                webhook_urls=webhooks,
                webhook_bearer_token=bearer,
            )

            if success:
                charged = credit_service.deduct_subscription_push(
                    int(subscription.user_id),
                    credits_needed,
                    subscription_id=int(subscription.id),
                    code=subscription.code,
                )
                if charged <= 0:
                    db.create_subscription_push_log(
                        subscription_id=int(subscription.id),
                        user_id=int(subscription.user_id),
                        shared_run_id=shared_run_id,
                        code=subscription.code,
                        pushed_on=analysis_date,
                        channel=channel,
                        status="failed",
                        error_message="扣费失败",
                    )
                    summary.pushes_failed += 1
                    continue

                db.update_stock_subscription(
                    int(subscription.id),
                    int(subscription.user_id),
                    last_pushed_on=analysis_date,
                    next_push_on=add_trading_days(
                        subscription.market,
                        analysis_date,
                        int(subscription.interval_days),
                    ),
                )
                db.create_subscription_push_log(
                    subscription_id=int(subscription.id),
                    user_id=int(subscription.user_id),
                    shared_run_id=shared_run_id,
                    code=subscription.code,
                    pushed_on=analysis_date,
                    channel=channel,
                    status="success",
                    credits_charged=charged,
                )
                summary.pushes_success += 1
                summary.credits_charged += charged
            else:
                db.create_subscription_push_log(
                    subscription_id=int(subscription.id),
                    user_id=int(subscription.user_id),
                    shared_run_id=shared_run_id,
                    code=subscription.code,
                    pushed_on=analysis_date,
                    channel=channel,
                    status="failed",
                    error_message="推送失败",
                )
                summary.pushes_failed += 1
