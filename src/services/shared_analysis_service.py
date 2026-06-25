# -*- coding: utf-8 -*-
"""Canonical shared analysis orchestration for prediction cycles."""

from __future__ import annotations

import json
import logging
import threading
import uuid
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Callable, Dict, Optional, Tuple

from data_provider.base import canonical_stock_code
from src.config import clear_user_config_cache, get_config
from src.core.pipeline import StockAnalysisPipeline
from src.core.prediction_cycle import PredictionCycle, resolve_prediction_cycle
from src.core.trading_calendar import get_market_for_stock
from src.enums import ReportType
from src.services.credit_service import CreditService
from src.services.intel_probe_service import (
    build_news_fingerprint,
    extract_urls_from_news_content,
    parse_news_fingerprint,
    probe_new_intel,
)
from src.services.stock_code_utils import resolve_lookup_stock_code
from src.storage import DatabaseManager, SharedAnalysisRun
from src.user_context import CurrentUser, get_current_user, use_current_user

logger = logging.getLogger(__name__)

# Leader pipeline may run several minutes; followers wait for the same cycle key.
_INFLIGHT_WAIT_SECONDS = 900


class SharedAnalysisPurchaseRequiredError(Exception):
    """Raised when marketplace listings require purchase before shared-cache access."""

    def __init__(self, stock_code: str):
        self.stock_code = stock_code
        super().__init__(f"请先购买预测报告后再查看: {stock_code}")


@dataclass
class SharedAnalysisOutcome:
    shared_run: Optional[SharedAnalysisRun]
    history_id: Optional[int]
    query_id: str
    from_cache: bool
    probe_credits_charged: int = 0
    cycle: Optional[PredictionCycle] = None
    result: Any = None


class SharedAnalysisService:
    _instance: Optional["SharedAnalysisService"] = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._inflight_lock = threading.Lock()
        self._inflight: Dict[Tuple[str, date, str], threading.Event] = {}
        self._service_initialized = True

    @classmethod
    def get_instance(cls) -> "SharedAnalysisService":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @staticmethod
    def _inflight_key(
        code: str,
        cycle: PredictionCycle,
        report_type_value: str,
    ) -> Tuple[str, date, str]:
        return (code, cycle.cycle_anchor_date, report_type_value)

    def _acquire_inflight(self, key: Tuple[str, date, str]) -> Tuple[bool, threading.Event]:
        with self._inflight_lock:
            existing = self._inflight.get(key)
            if existing is not None:
                return False, existing
            event = threading.Event()
            self._inflight[key] = event
            return True, event

    def _release_inflight(self, key: Tuple[str, date, str], event: threading.Event) -> None:
        with self._inflight_lock:
            if self._inflight.get(key) is event:
                self._inflight.pop(key, None)
        event.set()

    def lookup_cycle_report(
        self,
        *,
        code: str,
        report_type: ReportType,
        query_id: Optional[str] = None,
        owner_user_id: Optional[int] = None,
        materialize: bool = False,
    ) -> Dict[str, Any]:
        """Return whether the viewer may access their own cycle report without purchase."""
        normalized_code = resolve_lookup_stock_code(code)
        market = get_market_for_stock(normalized_code) or "cn"
        cycle = resolve_prediction_cycle(market)
        report_type_value = report_type.value
        effective_query_id = query_id or uuid.uuid4().hex

        db = DatabaseManager.get_instance()
        existing = db.get_shared_analysis_run(
            normalized_code,
            cycle.cycle_anchor_date,
            report_type_value,
        )

        actor = get_current_user()
        effective_owner_id = owner_user_id
        if effective_owner_id is None and actor is not None:
            effective_owner_id = int(actor.id)

        cycle_meta = {
            "cycle_anchor_date": cycle.cycle_anchor_date.isoformat(),
            "prediction_target_date": cycle.prediction_target_date.isoformat(),
            "data_as_of_date": cycle.data_as_of_date.isoformat(),
        }

        if existing is None or not existing.analysis_history_id:
            return {
                "exists": False,
                "stock_code": normalized_code,
                "report_type": report_type_value,
                "prediction_cycle": cycle_meta,
            }

        canonical = db.get_analysis_history_by_id(
            int(existing.analysis_history_id),
            scoped=False,
        )
        history_id: Optional[int] = None

        if (
            canonical is not None
            and effective_owner_id is not None
            and int(canonical.owner_user_id) == int(effective_owner_id)
        ):
            history_id = int(canonical.id)
        elif effective_owner_id is not None:
            user_history = db.get_analysis_history_for_shared_run(
                owner_user_id=int(effective_owner_id),
                shared_run_id=int(existing.id),
            )
            if user_history is not None:
                history_id = int(user_history.id)
        elif materialize:
            history_id = int(existing.analysis_history_id)

        if history_id is None and materialize and effective_owner_id is not None:
            history_id = self._ensure_user_history_from_shared(
                shared_run=existing,
                owner_user_id=effective_owner_id,
                query_id=effective_query_id,
            )

        if history_id is None:
            stock_name = (canonical.name if canonical else "") or normalized_code
            return {
                "exists": False,
                "stock_code": normalized_code,
                "stock_name": stock_name,
                "report_type": report_type_value,
                "prediction_cycle": cycle_meta,
            }

        last_analyzed_at = None
        if existing.last_analyzed_at is not None:
            last_analyzed_at = existing.last_analyzed_at.isoformat()

        return {
            "exists": True,
            "stock_code": normalized_code,
            "stock_name": (canonical.name if canonical else "") or normalized_code,
            "report_type": report_type_value,
            "history_id": history_id,
            "shared_run_id": int(existing.id),
            "version": int(existing.version or 1),
            "last_analyzed_at": last_analyzed_at,
            "prediction_cycle": cycle_meta,
        }

    @staticmethod
    def _load_context_snapshot(
        db: DatabaseManager,
        *,
        shared_run: SharedAnalysisRun,
        canonical_history_id: int,
    ) -> Optional[Dict[str, Any]]:
        if shared_run.data_snapshot_id:
            snapshot = db.get_stock_data_snapshot_by_id(int(shared_run.data_snapshot_id))
            if isinstance(snapshot, dict) and snapshot.get("enhanced_context"):
                return snapshot

        canonical = db.get_analysis_history_by_id(int(canonical_history_id), scoped=False)
        if canonical is None or not canonical.context_snapshot:
            return None
        try:
            payload = json.loads(canonical.context_snapshot)
        except Exception:
            return None
        return payload if isinstance(payload, dict) else None

    def get_or_create(
        self,
        *,
        code: str,
        report_type: ReportType,
        force_refresh: bool = False,
        query_id: Optional[str] = None,
        owner_user_id: Optional[int] = None,
        admin_user: Optional[CurrentUser] = None,
        allow_intel_probe: bool = False,
        charge_probe_credits: bool = True,
        single_stock_notify: bool = False,
        progress_callback: Optional[Callable[[int, str], None]] = None,
        query_source: str = "api",
        analysis_mode: str = "full",
    ) -> SharedAnalysisOutcome:
        normalized_code = resolve_lookup_stock_code(code)
        market = get_market_for_stock(normalized_code) or "cn"
        cycle = resolve_prediction_cycle(market)
        report_type_value = report_type.value
        effective_query_id = query_id or uuid.uuid4().hex

        db = DatabaseManager.get_instance()
        existing = db.get_shared_analysis_run(
            normalized_code,
            cycle.cycle_anchor_date,
            report_type_value,
        )

        actor = admin_user or get_current_user()
        effective_owner_id = owner_user_id
        if effective_owner_id is None and actor is not None:
            effective_owner_id = int(actor.id)

        if analysis_mode == "refresh_intel":
            return self._refresh_intel(
                normalized_code=normalized_code,
                market=market,
                cycle=cycle,
                report_type=report_type,
                report_type_value=report_type_value,
                existing=existing,
                effective_query_id=effective_query_id,
                effective_owner_id=effective_owner_id,
                actor=actor,
                admin_user=admin_user,
                single_stock_notify=single_stock_notify,
                progress_callback=progress_callback,
                query_source=query_source,
            )

        if (
            not force_refresh
            and existing is not None
            and existing.analysis_history_id
            and allow_intel_probe
        ):
            canonical = db.get_analysis_history_by_id(
                int(existing.analysis_history_id),
                scoped=False,
            )
            probe_start = existing.last_analyzed_at or cycle.anchor_cutoff_at
            known_urls = parse_news_fingerprint(existing.news_fingerprint)
            if not known_urls:
                known_urls = set(extract_urls_from_news_content(
                    canonical.news_content if canonical else None
                ))

            stock_name = (canonical.name if canonical else "") or normalized_code
            probe = probe_new_intel(
                stock_code=normalized_code,
                stock_name=stock_name or normalized_code,
                since=probe_start,
                known_urls=known_urls,
            )
            if not probe.has_new_intel:
                self._raise_if_purchase_required(
                    existing=existing,
                    normalized_code=normalized_code,
                    cycle=cycle,
                    viewer_user_id=effective_owner_id,
                )
                history_id = self._ensure_user_history_from_shared(
                    shared_run=existing,
                    owner_user_id=effective_owner_id,
                    query_id=effective_query_id,
                )
                probe_credits = 0
                if (
                    charge_probe_credits
                    and probe.attempted
                    and not probe.search_failed
                    and effective_owner_id is not None
                ):
                    probe_credits = CreditService.get_instance().deduct_analysis_probe(
                        int(effective_owner_id),
                        code=normalized_code,
                        shared_run_id=int(existing.id),
                    )
                return SharedAnalysisOutcome(
                    shared_run=existing,
                    history_id=history_id,
                    query_id=effective_query_id,
                    from_cache=True,
                    probe_credits_charged=probe_credits,
                    cycle=cycle,
                )
            force_refresh = True
            logger.info(
                "%s 周期 %s 探测到新情报，触发重分析",
                normalized_code,
                cycle.cycle_anchor_date,
            )

        if (
            not force_refresh
            and existing is not None
            and existing.analysis_history_id
        ):
            self._raise_if_purchase_required(
                existing=existing,
                normalized_code=normalized_code,
                cycle=cycle,
                viewer_user_id=effective_owner_id,
            )
            history_id = self._ensure_user_history_from_shared(
                shared_run=existing,
                owner_user_id=effective_owner_id,
                query_id=effective_query_id,
            )
            return SharedAnalysisOutcome(
                shared_run=existing,
                history_id=history_id,
                query_id=effective_query_id,
                from_cache=True,
                cycle=cycle,
            )

        inflight_key: Optional[Tuple[str, date, str]] = None
        inflight_event: Optional[threading.Event] = None
        is_inflight_leader = False
        if not force_refresh:
            inflight_key = self._inflight_key(normalized_code, cycle, report_type_value)
            is_inflight_leader, inflight_event = self._acquire_inflight(inflight_key)
            if not is_inflight_leader and inflight_event is not None:
                logger.info(
                    "[shared_analysis] 同周期分析进行中，等待结果: code=%s cycle=%s type=%s",
                    normalized_code,
                    cycle.cycle_anchor_date,
                    report_type_value,
                )
                inflight_event.wait(timeout=_INFLIGHT_WAIT_SECONDS)
                return self.get_or_create(
                    code=code,
                    report_type=report_type,
                    force_refresh=False,
                    query_id=query_id,
                    owner_user_id=owner_user_id,
                    admin_user=admin_user,
                    allow_intel_probe=allow_intel_probe,
                    charge_probe_credits=charge_probe_credits,
                    single_stock_notify=single_stock_notify,
                    progress_callback=progress_callback,
                    query_source=query_source,
                    analysis_mode=analysis_mode,
                )

        try:
            run_user = admin_user
            if run_user is None and actor is not None:
                run_user = actor
            if run_user is None:
                admin_id = db.ensure_default_admin_user()
                run_user = CurrentUser(
                    id=int(admin_id),
                    username="admin",
                    is_admin=True,
                    account_type="system",
                )

            with use_current_user(run_user):
                clear_user_config_cache(run_user.id)
                pipeline = StockAnalysisPipeline(
                    config=get_config(),
                    query_id=effective_query_id,
                    query_source=query_source,
                    progress_callback=progress_callback,
                )
                result = pipeline.process_single_stock(
                    normalized_code,
                    single_stock_notify=single_stock_notify,
                    report_type=report_type,
                    analysis_query_id=effective_query_id,
                )

            if result is None or not getattr(result, "success", False):
                return SharedAnalysisOutcome(
                    shared_run=existing,
                    history_id=None,
                    query_id=effective_query_id,
                    from_cache=False,
                    cycle=cycle,
                    result=result,
                )

            history = db.get_latest_analysis_history_for_code(normalized_code, int(run_user.id))
            if history is None:
                logger.error("%s 分析完成但未找到历史记录", normalized_code)
                return SharedAnalysisOutcome(
                    shared_run=existing,
                    history_id=None,
                    query_id=effective_query_id,
                    from_cache=False,
                    cycle=cycle,
                    result=result,
                )

            snapshot_id = None
            if history.context_snapshot:
                try:
                    payload = json.loads(history.context_snapshot)
                    if isinstance(payload, dict):
                        snapshot = db.upsert_stock_data_snapshot(
                            code=normalized_code,
                            cycle_anchor_date=cycle.cycle_anchor_date,
                            market=market,
                            payload=payload,
                        )
                        snapshot_id = int(snapshot.id)
                except Exception as exc:
                    logger.warning("%s 保存数据快照失败: %s", normalized_code, exc)

            news_urls = extract_urls_from_news_content(history.news_content)
            fingerprint = build_news_fingerprint(news_urls)
            analyzed_at = datetime.now()
            next_version = int(existing.version or 0) + 1 if existing is not None else 1

            if existing is None:
                try:
                    shared_run = db.create_shared_analysis_run(
                        code=normalized_code,
                        analysis_date=cycle.cycle_anchor_date,
                        market=market,
                        report_type=report_type_value,
                        analysis_history_id=int(history.id),
                        query_id=effective_query_id,
                        data_as_of_date=cycle.data_as_of_date,
                        prediction_target_date=cycle.prediction_target_date,
                        last_analyzed_at=analyzed_at,
                        news_fingerprint=fingerprint,
                        version=next_version,
                        data_snapshot_id=snapshot_id,
                        status="ready",
                    )
                except Exception:
                    shared_run = db.get_shared_analysis_run(
                        normalized_code,
                        cycle.cycle_anchor_date,
                        report_type_value,
                    )
                    if shared_run is None:
                        raise
                    db.update_shared_analysis_run(
                        int(shared_run.id),
                        analysis_history_id=int(history.id),
                        query_id=effective_query_id,
                        data_as_of_date=cycle.data_as_of_date,
                        prediction_target_date=cycle.prediction_target_date,
                        last_analyzed_at=analyzed_at,
                        news_fingerprint=fingerprint,
                        version=next_version,
                        data_snapshot_id=snapshot_id,
                        status="ready",
                    )
                    shared_run = db.get_shared_analysis_run(
                        normalized_code,
                        cycle.cycle_anchor_date,
                        report_type_value,
                    )
            else:
                db.update_shared_analysis_run(
                    int(existing.id),
                    analysis_history_id=int(history.id),
                    query_id=effective_query_id,
                    data_as_of_date=cycle.data_as_of_date,
                    prediction_target_date=cycle.prediction_target_date,
                    last_analyzed_at=analyzed_at,
                    news_fingerprint=fingerprint,
                    version=next_version,
                    data_snapshot_id=snapshot_id,
                    status="ready",
                )
                shared_run = db.get_shared_analysis_run(
                    normalized_code,
                    cycle.cycle_anchor_date,
                    report_type_value,
                )

            if shared_run is not None:
                self._link_history_to_shared(int(history.id), int(shared_run.id))
                self._stamp_history_cycle_version(
                    int(history.id),
                    int(shared_run.version or next_version),
                )

            user_history_id = int(history.id)
            if (
                effective_owner_id is not None
                and int(effective_owner_id) != int(run_user.id)
            ):
                cloned = db.clone_analysis_history_for_user(
                    canonical_history_id=int(history.id),
                    owner_user_id=int(effective_owner_id),
                    query_id=effective_query_id,
                    shared_run_id=int(shared_run.id) if shared_run else None,
                )
                if cloned is not None:
                    user_history_id = int(cloned.id)

            return SharedAnalysisOutcome(
                shared_run=shared_run,
                history_id=user_history_id,
                query_id=effective_query_id,
                from_cache=False,
                cycle=cycle,
                result=result,
            )
        finally:
            if (
                is_inflight_leader
                and inflight_key is not None
                and inflight_event is not None
            ):
                self._release_inflight(inflight_key, inflight_event)

    def _refresh_intel(
        self,
        *,
        normalized_code: str,
        market: str,
        cycle: PredictionCycle,
        report_type: ReportType,
        report_type_value: str,
        existing: Optional[SharedAnalysisRun],
        effective_query_id: str,
        effective_owner_id: Optional[int],
        actor: Optional[CurrentUser],
        admin_user: Optional[CurrentUser],
        single_stock_notify: bool,
        progress_callback: Optional[Callable[[int, str], None]],
        query_source: str,
    ) -> SharedAnalysisOutcome:
        db = DatabaseManager.get_instance()
        if existing is None or not existing.analysis_history_id:
            logger.warning(
                "%s 周期 %s 无可用快照，refresh_intel 降级为全量分析",
                normalized_code,
                cycle.cycle_anchor_date,
            )
            return self.get_or_create(
                code=normalized_code,
                report_type=report_type,
                force_refresh=True,
                query_id=effective_query_id,
                owner_user_id=effective_owner_id,
                admin_user=admin_user,
                allow_intel_probe=False,
                single_stock_notify=single_stock_notify,
                progress_callback=progress_callback,
                query_source=query_source,
                analysis_mode="full",
            )

        context_snapshot = self._load_context_snapshot(
            db,
            shared_run=existing,
            canonical_history_id=int(existing.analysis_history_id),
        )
        if not context_snapshot:
            logger.warning(
                "%s 周期 %s 快照加载失败，refresh_intel 降级为全量分析",
                normalized_code,
                cycle.cycle_anchor_date,
            )
            return self.get_or_create(
                code=normalized_code,
                report_type=report_type,
                force_refresh=True,
                query_id=effective_query_id,
                owner_user_id=effective_owner_id,
                admin_user=admin_user,
                allow_intel_probe=False,
                single_stock_notify=single_stock_notify,
                progress_callback=progress_callback,
                query_source=query_source,
                analysis_mode="full",
            )

        canonical = db.get_analysis_history_by_id(
            int(existing.analysis_history_id),
            scoped=False,
        )
        stock_name = (canonical.name if canonical else "") or normalized_code

        inflight_key = self._inflight_key(normalized_code, cycle, report_type_value)
        is_inflight_leader, inflight_event = self._acquire_inflight(inflight_key)
        if not is_inflight_leader and inflight_event is not None:
            inflight_event.wait(timeout=_INFLIGHT_WAIT_SECONDS)
            return self.get_or_create(
                code=normalized_code,
                report_type=report_type,
                force_refresh=False,
                query_id=effective_query_id,
                owner_user_id=effective_owner_id,
                admin_user=admin_user,
                allow_intel_probe=False,
                single_stock_notify=single_stock_notify,
                progress_callback=progress_callback,
                query_source=query_source,
                analysis_mode="refresh_intel",
            )

        try:
            run_user = admin_user
            if run_user is None and actor is not None:
                run_user = actor
            if run_user is None:
                admin_id = db.ensure_default_admin_user()
                run_user = CurrentUser(
                    id=int(admin_id),
                    username="admin",
                    is_admin=True,
                    account_type="system",
                )

            with use_current_user(run_user):
                clear_user_config_cache(run_user.id)
                pipeline = StockAnalysisPipeline(
                    config=get_config(),
                    query_id=effective_query_id,
                    query_source=query_source,
                    progress_callback=progress_callback,
                )
                result = pipeline.refresh_intel_from_snapshot(
                    normalized_code,
                    report_type,
                    effective_query_id,
                    context_snapshot,
                    stock_name=stock_name,
                    send_notification=single_stock_notify,
                )

            if result is None or not getattr(result, "success", False):
                return SharedAnalysisOutcome(
                    shared_run=existing,
                    history_id=None,
                    query_id=effective_query_id,
                    from_cache=False,
                    cycle=cycle,
                    result=result,
                )

            history = db.get_latest_analysis_history_for_code(normalized_code, int(run_user.id))
            if history is None:
                return SharedAnalysisOutcome(
                    shared_run=existing,
                    history_id=None,
                    query_id=effective_query_id,
                    from_cache=False,
                    cycle=cycle,
                    result=result,
                )

            snapshot_id = existing.data_snapshot_id
            if history.context_snapshot:
                try:
                    payload = json.loads(history.context_snapshot)
                    if isinstance(payload, dict):
                        snapshot = db.upsert_stock_data_snapshot(
                            code=normalized_code,
                            cycle_anchor_date=cycle.cycle_anchor_date,
                            market=market,
                            payload=payload,
                        )
                        snapshot_id = int(snapshot.id)
                except Exception as exc:
                    logger.warning("%s refresh_intel 保存数据快照失败: %s", normalized_code, exc)

            news_urls = extract_urls_from_news_content(history.news_content)
            fingerprint = build_news_fingerprint(news_urls)
            analyzed_at = datetime.now()
            next_version = int(existing.version or 0) + 1

            db.update_shared_analysis_run(
                int(existing.id),
                analysis_history_id=int(history.id),
                query_id=effective_query_id,
                data_as_of_date=cycle.data_as_of_date,
                prediction_target_date=cycle.prediction_target_date,
                last_analyzed_at=analyzed_at,
                news_fingerprint=fingerprint,
                version=next_version,
                data_snapshot_id=snapshot_id,
                status="ready",
            )
            shared_run = db.get_shared_analysis_run(
                normalized_code,
                cycle.cycle_anchor_date,
                report_type_value,
            )
            self._link_history_to_shared(int(history.id), int(existing.id))
            self._stamp_history_cycle_version(int(history.id), next_version)

            user_history_id = int(history.id)
            if (
                effective_owner_id is not None
                and int(effective_owner_id) != int(run_user.id)
            ):
                cloned = db.clone_analysis_history_for_user(
                    canonical_history_id=int(history.id),
                    owner_user_id=int(effective_owner_id),
                    query_id=effective_query_id,
                    shared_run_id=int(existing.id),
                )
                if cloned is not None:
                    user_history_id = int(cloned.id)

            return SharedAnalysisOutcome(
                shared_run=shared_run,
                history_id=user_history_id,
                query_id=effective_query_id,
                from_cache=False,
                cycle=cycle,
                result=result,
            )
        finally:
            if is_inflight_leader and inflight_event is not None:
                self._release_inflight(inflight_key, inflight_event)

    @staticmethod
    def _stamp_history_cycle_version(history_id: int, cycle_version: int) -> None:
        DatabaseManager.get_instance().update_analysis_history_cycle_version(
            int(history_id),
            int(cycle_version),
        )

    @staticmethod
    def _raise_if_purchase_required(
        *,
        existing: SharedAnalysisRun,
        normalized_code: str,
        cycle: PredictionCycle,
        viewer_user_id: Optional[int],
    ) -> None:
        if viewer_user_id is None or not existing.analysis_history_id:
            return

        db = DatabaseManager.get_instance()
        canonical = db.get_analysis_history_by_id(int(existing.analysis_history_id), scoped=False)
        if canonical is None or int(canonical.owner_user_id) == int(viewer_user_id):
            return

        rows = db.list_prediction_report_listings_for_code_cycle(
            code=normalized_code,
            cycle_anchor_date=cycle.cycle_anchor_date,
            status="active",
        )
        for row in rows:
            if int(row.seller_user_id) == int(viewer_user_id):
                continue
            purchase = db.get_prediction_report_purchase(
                listing_id=int(row.id),
                buyer_user_id=int(viewer_user_id),
            )
            if purchase is None:
                raise SharedAnalysisPurchaseRequiredError(normalized_code)

    @staticmethod
    def _ensure_user_history_from_shared(
        *,
        shared_run: SharedAnalysisRun,
        owner_user_id: Optional[int],
        query_id: str,
    ) -> Optional[int]:
        if not shared_run.analysis_history_id:
            return None
        if owner_user_id is None:
            return int(shared_run.analysis_history_id)

        db = DatabaseManager.get_instance()
        canonical_id = int(shared_run.analysis_history_id)
        canonical = db.get_analysis_history_by_id(canonical_id, scoped=False)
        if canonical is not None and int(canonical.owner_user_id) == int(owner_user_id):
            return canonical_id

        existing_clone = db.get_analysis_history_for_shared_run(
            owner_user_id=int(owner_user_id),
            shared_run_id=int(shared_run.id),
        )
        if existing_clone is not None:
            return int(existing_clone.id)

        cloned = db.clone_analysis_history_for_user(
            canonical_history_id=canonical_id,
            owner_user_id=int(owner_user_id),
            query_id=query_id,
            shared_run_id=int(shared_run.id),
        )
        return int(cloned.id) if cloned is not None else canonical_id

    @staticmethod
    def _link_history_to_shared(history_id: int, shared_run_id: int) -> None:
        db = DatabaseManager.get_instance()
        with db.session_scope() as session:
            from sqlalchemy import select
            from src.storage import AnalysisHistory

            row = session.execute(
                select(AnalysisHistory).where(AnalysisHistory.id == int(history_id)).limit(1)
            ).scalar_one_or_none()
            if row is not None:
                row.shared_run_id = int(shared_run_id)
