# -*- coding: utf-8 -*-
"""Canonical shared analysis orchestration for prediction cycles."""

from __future__ import annotations

import json
import logging
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable, Optional

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
from src.storage import DatabaseManager, SharedAnalysisRun
from src.user_context import CurrentUser, get_current_user, use_current_user

logger = logging.getLogger(__name__)


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

    @classmethod
    def get_instance(cls) -> "SharedAnalysisService":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def get_or_create(
        self,
        *,
        code: str,
        report_type: ReportType,
        force_refresh: bool = False,
        query_id: Optional[str] = None,
        owner_user_id: Optional[int] = None,
        admin_user: Optional[CurrentUser] = None,
        allow_intel_probe: bool = True,
        charge_probe_credits: bool = True,
        single_stock_notify: bool = False,
        progress_callback: Optional[Callable[[int, str], None]] = None,
        query_source: str = "api",
    ) -> SharedAnalysisOutcome:
        normalized_code = canonical_stock_code(code) or code
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
