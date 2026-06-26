# -*- coding: utf-8 -*-
"""Prediction report sharing and purchase marketplace."""

from __future__ import annotations

import logging
import os
import threading
import uuid
from datetime import date
from typing import Any, Dict, List, Optional

from data_provider.base import canonical_stock_code
from src.core.prediction_cycle import resolve_prediction_cycle
from src.core.trading_calendar import get_market_for_stock
from src.enums import ReportType
from src.services.prediction_report_listing_utils import pick_latest_listing_per_stock
from src.services.shared_analysis_service import SharedAnalysisService
from src.services.stock_code_utils import resolve_lookup_stock_code
from src.services.credit_service import CreditService, InsufficientCreditsError
from src.services.backtest_service import BacktestService
from src.storage import DatabaseManager, PredictionReportListing

logger = logging.getLogger(__name__)


class PredictionReportMarketError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


class PredictionReportMarketService:
    _instance: Optional["PredictionReportMarketService"] = None
    _lock = threading.Lock()

    @classmethod
    def get_instance(cls) -> "PredictionReportMarketService":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @staticmethod
    def _parse_positive_int_env(name: str, default: int) -> int:
        raw = os.getenv(name)
        if raw is None or not str(raw).strip():
            return default
        try:
            value = int(raw)
        except ValueError:
            return default
        return value if value > 0 else default

    def get_pricing(self) -> Dict[str, int]:
        purchase = self._parse_positive_int_env("PREDICTION_REPORT_PURCHASE_CREDITS", 100)
        seller = self._parse_positive_int_env("PREDICTION_REPORT_SELLER_CREDITS", 90)
        if seller > purchase:
            seller = max(0, purchase - 1)
        return {
            "purchase_credits": purchase,
            "seller_reward_credits": seller,
            "platform_credits": max(0, purchase - seller),
        }

    def can_share_history(self, *, owner_user_id: int, history_id: int) -> bool:
        try:
            self._validate_share_candidate(owner_user_id=owner_user_id, history_id=history_id)
            return True
        except PredictionReportMarketError:
            return False

    def share_report(self, *, owner_user_id: int, history_id: int) -> Dict[str, Any]:
        """Recommend a report to the prediction marketplace (legacy alias)."""
        return self.recommend_report(owner_user_id=owner_user_id, history_id=history_id)

    def recommend_report(self, *, owner_user_id: int, history_id: int) -> Dict[str, Any]:
        history, shared_run, cycle_anchor = self._validate_share_candidate(
            owner_user_id=owner_user_id,
            history_id=history_id,
        )
        db = DatabaseManager.get_instance()
        existing = db.get_prediction_report_listing_by_history_id(int(history.id))
        if existing is not None:
            stats = db.get_prediction_report_like_stats(
                [int(existing.id)],
                user_id=int(owner_user_id),
            ).get(int(existing.id), {"like_count": 0, "liked": False})
            return self._serialize_listing(
                existing,
                viewer_user_id=owner_user_id,
                purchased=True,
                can_view_full=True,
                has_purchase_record=False,
                like_count=int(stats["like_count"]),
                liked=bool(stats["liked"]),
                purchase_count=db.count_prediction_report_purchases([int(existing.id)]).get(int(existing.id), 0),
            )

        pricing = self.get_pricing()
        market = get_market_for_stock(history.code) or shared_run.market or "cn"
        listing = db.create_prediction_report_listing(
            seller_user_id=int(owner_user_id),
            analysis_history_id=int(history.id),
            shared_run_id=int(shared_run.id),
            code=resolve_lookup_stock_code(history.code),
            name=history.name,
            market=market,
            cycle_anchor_date=cycle_anchor,
            report_type=history.report_type or "detailed",
            purchase_credits=pricing["purchase_credits"],
            seller_reward_credits=pricing["seller_reward_credits"],
            cycle_version=int(getattr(history, "cycle_version", None) or shared_run.version or 1),
        )
        db.supersede_older_prediction_report_listings(
            seller_user_id=int(owner_user_id),
            code=listing.code,
            cycle_anchor_date=cycle_anchor,
            keep_listing_id=int(listing.id),
            keep_version=int(listing.cycle_version),
        )
        logger.info(
            "Prediction report recommended: listing=%s user=%s code=%s anchor=%s",
            listing.id,
            owner_user_id,
            history.code,
            cycle_anchor,
        )
        return self._serialize_listing(
            listing,
            viewer_user_id=owner_user_id,
            purchased=True,
            can_view_full=True,
            history=history,
            has_purchase_record=False,
            like_count=0,
            liked=False,
        )

    def _listing_is_current_cycle(self, listing: PredictionReportListing) -> bool:
        market = listing.market or get_market_for_stock(listing.code) or "cn"
        cycle = resolve_prediction_cycle(market)
        anchor = listing.cycle_anchor_date
        if anchor is None:
            return False
        return anchor == cycle.cycle_anchor_date

    def list_reports(self, *, viewer_user_id: int) -> Dict[str, Any]:
        db = DatabaseManager.get_instance()
        pricing = self.get_pricing()
        rows = db.list_prediction_report_listings(status="active")
        like_stats = db.get_prediction_report_like_stats(
            [int(row.id) for row in rows],
            user_id=int(viewer_user_id),
        )
        purchase_counts = db.count_prediction_report_purchases(
            [int(row.id) for row in rows],
        )
        items: List[Dict[str, Any]] = []
        for row in rows:
            purchase = db.get_prediction_report_purchase(
                listing_id=int(row.id),
                buyer_user_id=int(viewer_user_id),
            )
            is_seller = int(row.seller_user_id) == int(viewer_user_id)
            has_purchase_record = purchase is not None
            stats = like_stats.get(int(row.id), {"like_count": 0, "liked": False})
            items.append(
                self._serialize_listing(
                    row,
                    viewer_user_id=viewer_user_id,
                    purchased=has_purchase_record or is_seller,
                    can_view_full=has_purchase_record or is_seller,
                    buyer_history_id=int(purchase.buyer_history_id) if purchase and purchase.buyer_history_id else None,
                    has_purchase_record=has_purchase_record,
                    like_count=int(stats["like_count"]),
                    liked=bool(stats["liked"]),
                    purchase_count=int(purchase_counts.get(int(row.id), 0)),
                )
            )
        return {
            "items": items,
            "total": len(items),
            "pricing": pricing,
        }

    def search_current_cycle(
        self,
        *,
        code: str,
        viewer_user_id: int,
        report_type: str = "detailed",
    ) -> Dict[str, Any]:
        """List marketplace reports for a stock in the current prediction cycle."""
        normalized = resolve_lookup_stock_code(code)
        market = get_market_for_stock(normalized) or "cn"
        cycle = resolve_prediction_cycle(market)
        db = DatabaseManager.get_instance()
        pricing = self.get_pricing()
        rows = db.list_prediction_report_listings_for_code_cycle(
            code=normalized,
            cycle_anchor_date=cycle.cycle_anchor_date,
            status="active",
        )

        cycle_lookup = SharedAnalysisService.get_instance().lookup_cycle_report(
            code=normalized,
            report_type=ReportType.from_str(report_type),
            owner_user_id=int(viewer_user_id),
            materialize=False,
        )
        cycle_report_meta = {
            "exists": bool(cycle_lookup.get("exists")),
            "history_id": cycle_lookup.get("history_id"),
            "version": cycle_lookup.get("version"),
            "last_analyzed_at": cycle_lookup.get("last_analyzed_at"),
            "shared_run_id": cycle_lookup.get("shared_run_id"),
        }
        can_refresh_intel = bool(cycle_lookup.get("exists"))

        if not rows:
            stock_name = cycle_lookup.get("stock_name") or normalized
            return {
                "stock_code": normalized,
                "stock_name": stock_name,
                "items": [],
                "total": 0,
                "pricing": pricing,
                "prediction_cycle": cycle_lookup.get("prediction_cycle")
                or {
                    "cycle_anchor_date": cycle.cycle_anchor_date.isoformat(),
                    "prediction_target_date": cycle.prediction_target_date.isoformat(),
                    "data_as_of_date": cycle.data_as_of_date.isoformat(),
                },
                "cycle_report": cycle_report_meta,
                "can_refresh_intel": can_refresh_intel,
            }

        like_stats = db.get_prediction_report_like_stats(
            [int(row.id) for row in rows],
            user_id=int(viewer_user_id),
        )
        purchase_counts = db.count_prediction_report_purchases(
            [int(row.id) for row in rows],
        )
        items: List[Dict[str, Any]] = []
        for row in rows:
            purchase = db.get_prediction_report_purchase(
                listing_id=int(row.id),
                buyer_user_id=int(viewer_user_id),
            )
            is_seller = int(row.seller_user_id) == int(viewer_user_id)
            has_purchase_record = purchase is not None
            stats = like_stats.get(int(row.id), {"like_count": 0, "liked": False})
            items.append(
                self._serialize_listing(
                    row,
                    viewer_user_id=viewer_user_id,
                    purchased=has_purchase_record or is_seller,
                    can_view_full=has_purchase_record or is_seller,
                    buyer_history_id=int(purchase.buyer_history_id) if purchase and purchase.buyer_history_id else None,
                    has_purchase_record=has_purchase_record,
                    like_count=int(stats["like_count"]),
                    liked=bool(stats["liked"]),
                    purchase_count=int(purchase_counts.get(int(row.id), 0)),
                    is_current_cycle=True,
                )
            )

        stock_name = rows[0].name or normalized
        items = pick_latest_listing_per_stock(items)
        return {
            "stock_code": normalized,
            "stock_name": stock_name,
            "items": items,
            "total": len(items),
            "pricing": pricing,
            "prediction_cycle": {
                "cycle_anchor_date": cycle.cycle_anchor_date.isoformat(),
                "prediction_target_date": cycle.prediction_target_date.isoformat(),
                "data_as_of_date": cycle.data_as_of_date.isoformat(),
            },
            "cycle_report": cycle_report_meta,
            "can_refresh_intel": can_refresh_intel,
        }

    def get_listing(self, *, listing_id: int, viewer_user_id: int) -> Dict[str, Any]:
        db = DatabaseManager.get_instance()
        listing = db.get_prediction_report_listing_by_id(int(listing_id))
        if listing is None or listing.status != "active":
            raise PredictionReportMarketError("not_found", "预测报告不存在或已下架")

        purchase = db.get_prediction_report_purchase(
            listing_id=int(listing.id),
            buyer_user_id=int(viewer_user_id),
        )
        is_seller = int(listing.seller_user_id) == int(viewer_user_id)
        has_purchase_record = purchase is not None
        history = None
        if purchase is not None and purchase.buyer_history_id:
            history = db.get_analysis_history_by_id(int(purchase.buyer_history_id), scoped=False)
        elif is_seller:
            history = db.get_analysis_history_by_id(int(listing.analysis_history_id), scoped=False)
        stats = db.get_prediction_report_like_stats(
            [int(listing.id)],
            user_id=int(viewer_user_id),
        ).get(int(listing.id), {"like_count": 0, "liked": False})
        purchase_count = db.count_prediction_report_purchases([int(listing.id)]).get(int(listing.id), 0)
        return self._serialize_listing(
            listing,
            viewer_user_id=viewer_user_id,
            purchased=has_purchase_record or is_seller,
            can_view_full=has_purchase_record or is_seller,
            history=history,
            buyer_history_id=int(purchase.buyer_history_id) if purchase and purchase.buyer_history_id else (
                int(listing.analysis_history_id) if is_seller else None
            ),
            has_purchase_record=has_purchase_record,
            like_count=int(stats["like_count"]),
            liked=bool(stats["liked"]),
            purchase_count=int(purchase_count),
        )

    def like_report(self, *, listing_id: int, user_id: int) -> Dict[str, Any]:
        db = DatabaseManager.get_instance()
        listing = db.get_prediction_report_listing_by_id(int(listing_id))
        if listing is None or listing.status != "active":
            raise PredictionReportMarketError("not_found", "预测报告不存在或已下架")
        liked, like_count = db.toggle_prediction_report_like(
            listing_id=int(listing_id),
            user_id=int(user_id),
        )
        return {
            "listing_id": int(listing_id),
            "liked": liked,
            "like_count": like_count,
        }

    def purchase_report(self, *, buyer_user_id: int, listing_id: int) -> Dict[str, Any]:
        db = DatabaseManager.get_instance()
        listing = db.get_prediction_report_listing_by_id(int(listing_id))
        if listing is None or listing.status != "active":
            raise PredictionReportMarketError("not_found", "预测报告不存在或已下架")
        if int(listing.seller_user_id) == int(buyer_user_id):
            raise PredictionReportMarketError("own_listing", "不能购买自己分享的报告")
        if not self._listing_is_current_cycle(listing):
            raise PredictionReportMarketError("expired_cycle", "该报告预测周期已结束，无法购买")

        existing = db.get_prediction_report_purchase(
            listing_id=int(listing.id),
            buyer_user_id=int(buyer_user_id),
        )
        if existing is not None:
            return {
                "listing_id": int(listing.id),
                "buyer_history_id": int(existing.buyer_history_id) if existing.buyer_history_id else None,
                "already_purchased": True,
                "credits_paid": int(existing.credits_paid),
            }

        shared_run = db.get_shared_analysis_run_by_id(int(listing.shared_run_id))
        if shared_run is None or not shared_run.analysis_history_id:
            raise PredictionReportMarketError("invalid_listing", "预测报告数据不完整")

        canonical_id = int(shared_run.analysis_history_id)
        purchase_credits = int(listing.purchase_credits)
        seller_credits = int(listing.seller_reward_credits)

        balance = CreditService.get_instance().get_balance(int(buyer_user_id))
        if balance < purchase_credits:
            raise InsufficientCreditsError(purchase_credits, balance)

        query_id = uuid.uuid4().hex
        cloned = db.clone_analysis_history_for_user(
            canonical_history_id=canonical_id,
            owner_user_id=int(buyer_user_id),
            query_id=query_id,
            shared_run_id=int(listing.shared_run_id),
        )
        if cloned is None:
            raise PredictionReportMarketError("clone_failed", "复制报告失败")

        # Clone canonical news intel into buyer scope so report news panel is populated.
        try:
            canonical = db.get_analysis_history_by_id(canonical_id, scoped=False)
            if canonical is not None and getattr(canonical, "query_id", None):
                db.clone_news_intel_for_query(
                    source_query_id=str(canonical.query_id),
                    target_query_id=str(query_id),
                    owner_user_id=int(buyer_user_id),
                )
        except Exception as exc:
            logger.warning("Clone news intel failed (non-blocking): %s", exc, exc_info=True)

        try:
            CreditService.get_instance().purchase_prediction_report(
                buyer_user_id=int(buyer_user_id),
                seller_user_id=int(listing.seller_user_id),
                purchase_credits=purchase_credits,
                seller_credits=seller_credits,
                listing_id=int(listing.id),
                code=listing.code,
            )
        except InsufficientCreditsError:
            raise
        except Exception as exc:
            logger.error("Prediction report purchase billing failed: %s", exc, exc_info=True)
            raise PredictionReportMarketError("billing_failed", "扣费失败，请稍后重试") from exc

        purchase = db.create_prediction_report_purchase(
            listing_id=int(listing.id),
            buyer_user_id=int(buyer_user_id),
            seller_user_id=int(listing.seller_user_id),
            credits_paid=purchase_credits,
            seller_credits=seller_credits,
            buyer_history_id=int(cloned.id),
        )

        return {
            "listing_id": int(listing.id),
            "purchase_id": int(purchase.id),
            "buyer_history_id": int(cloned.id),
            "already_purchased": False,
            "credits_paid": purchase_credits,
            "seller_credits": seller_credits,
        }

    def _validate_share_candidate(
        self,
        *,
        owner_user_id: int,
        history_id: int,
    ):
        db = DatabaseManager.get_instance()
        history = db.get_analysis_history_by_id(int(history_id), owner_user_id=int(owner_user_id))
        if history is None:
            raise PredictionReportMarketError("not_found", "分析记录不存在或无权访问")

        shared_run_id = getattr(history, "shared_run_id", None)
        shared_run = None
        if shared_run_id:
            shared_run = db.get_shared_analysis_run_by_id(int(shared_run_id))
        if shared_run is None:
            market = get_market_for_stock(history.code) or "cn"
            cycle = resolve_prediction_cycle(market)
            shared_run = db.get_shared_analysis_run(
                history.code,
                cycle.cycle_anchor_date,
                history.report_type or "detailed",
            )
        if shared_run is None:
            raise PredictionReportMarketError(
                "not_shareable",
                "仅当前预测周期的 canonical 报告可分享，请先完成本周期分析",
            )

        market = shared_run.market or get_market_for_stock(history.code) or "cn"
        cycle = resolve_prediction_cycle(market)
        cycle_anchor = shared_run.analysis_date or cycle.cycle_anchor_date
        if cycle_anchor != cycle.cycle_anchor_date:
            raise PredictionReportMarketError(
                "not_current_cycle",
                "仅当前预测周期报告可分享",
            )

        # Do not allow reselling purchased/cloned reports. Only the latest canonical
        # history bound to the shared run may be recommended.
        canonical_history_id = int(getattr(shared_run, "analysis_history_id", None) or 0)
        if canonical_history_id <= 0 or int(history.id) != canonical_history_id:
            raise PredictionReportMarketError(
                "not_canonical",
                "仅可推荐本周期最新分析结果（自动上架）；已购买报告不可再次推荐",
            )
        return history, shared_run, cycle_anchor

    def _serialize_listing(
        self,
        listing: PredictionReportListing,
        *,
        viewer_user_id: int,
        purchased: bool,
        can_view_full: bool,
        history: Any = None,
        buyer_history_id: Optional[int] = None,
        has_purchase_record: bool = False,
        is_current_cycle: Optional[bool] = None,
        like_count: int = 0,
        liked: bool = False,
        purchase_count: int = 0,
    ) -> Dict[str, Any]:
        db = DatabaseManager.get_instance()
        shared_run = db.get_shared_analysis_run_by_id(int(listing.shared_run_id))
        listing_history = db.get_analysis_history_by_id(
            int(listing.analysis_history_id),
            scoped=False,
        )
        if history is None:
            history_id = (
                int(shared_run.analysis_history_id)
                if shared_run and shared_run.analysis_history_id
                else int(listing.analysis_history_id)
            )
            history = db.get_analysis_history_by_id(history_id, scoped=False)

        analyzed_at = None
        if listing_history is not None and getattr(listing_history, "created_at", None) is not None:
            analyzed_at = listing_history.created_at
        elif history is not None and getattr(history, "created_at", None) is not None:
            analyzed_at = history.created_at
        elif listing.created_at is not None:
            analyzed_at = listing.created_at

        seller_name = db.get_user_username(int(listing.seller_user_id)) or f"user_{listing.seller_user_id}"
        preview = {
            "sentiment_score": getattr(history, "sentiment_score", None) if history else None,
            "operation_advice": getattr(history, "operation_advice", None) if history else None,
            "trend_prediction": getattr(history, "trend_prediction", None) if history else None,
        }
        if can_view_full and history is not None:
            preview["analysis_summary"] = history.analysis_summary

        is_mine = int(listing.seller_user_id) == int(viewer_user_id)
        if is_current_cycle is None:
            is_current_cycle = self._listing_is_current_cycle(listing)
        can_purchase = bool(is_current_cycle and not is_mine and not has_purchase_record)

        canonical_history_id = int(listing.analysis_history_id)
        backtest_preview = BacktestService(DatabaseManager.get_instance()).get_backtest_preview_for_history(
            canonical_history_id,
        )

        return {
            "id": int(listing.id),
            "analysis_history_id": canonical_history_id,
            "seller_user_id": int(listing.seller_user_id),
            "seller_username": seller_name,
            "code": listing.code,
            "name": listing.name or listing.code,
            "market": listing.market,
            "cycle_anchor_date": listing.cycle_anchor_date.isoformat() if listing.cycle_anchor_date else None,
            "report_type": listing.report_type,
            "purchase_credits": int(listing.purchase_credits),
            "seller_reward_credits": int(listing.seller_reward_credits),
            "is_mine": is_mine,
            "purchased": purchased,
            "can_view_full": can_view_full,
            "can_purchase": can_purchase,
            "is_current_cycle": is_current_cycle,
            "has_purchase_record": has_purchase_record,
            "buyer_history_id": buyer_history_id,
            "preview": preview,
            "like_count": int(like_count),
            "liked": bool(liked),
            "created_at": listing.created_at.isoformat() if listing.created_at else None,
            "analyzed_at": analyzed_at.isoformat() if analyzed_at is not None else None,
            "purchase_count": int(purchase_count),
            "cycle_version": int(getattr(listing, "cycle_version", None) or 1),
            "backtest_preview": backtest_preview,
        }
