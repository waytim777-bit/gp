# -*- coding: utf-8 -*-
"""Tests for SharedAnalysisService cache + probe flow."""

import os
import tempfile
import threading
import unittest
from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from src.auth import register_user
from src.config import Config
from src.core.prediction_cycle import PredictionCycle
from src.enums import ReportType
from src.services.credit_service import CreditService
from src.services.intel_probe_service import IntelProbeResult
from src.services.prediction_report_market_service import PredictionReportMarketService
from src.services.shared_analysis_service import (
    SharedAnalysisPurchaseRequiredError,
    SharedAnalysisService,
)
from src.storage import DatabaseManager
from src.user_context import CurrentUser


class SharedAnalysisServiceTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temp_dir.name)
        self._original_database_path = os.environ.get("DATABASE_PATH")
        self._original_database_url = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_PATH"] = str(self.data_dir / "test.db")
        os.environ.pop("DATABASE_URL", None)
        os.environ["CREDITS_ANALYSIS_PROBE"] = "3"
        Config.reset_instance()
        DatabaseManager.reset_instance()
        CreditService._instance = None
        SharedAnalysisService._instance = None

        db = DatabaseManager.get_instance()
        self.admin_id = int(db.ensure_default_admin_user())
        self.admin_user = CurrentUser(
            id=self.admin_id,
            username="admin",
            is_admin=True,
            account_type="system",
        )
        db.add_credit_transaction(user_id=self.admin_id, credit_amount=100, reason="test")

        self.cycle = PredictionCycle(
            market="cn",
            cycle_anchor_date=date(2026, 6, 13),
            prediction_target_date=date(2026, 6, 16),
            data_as_of_date=date(2026, 6, 13),
            anchor_cutoff_at=datetime(2026, 6, 13, 18, 0),
            cycle_ends_at=datetime(2026, 6, 16, 18, 0),
        )

        shared = db.create_shared_analysis_run(
            code="600519",
            analysis_date=self.cycle.cycle_anchor_date,
            market="cn",
            report_type="simple",
            analysis_history_id=None,
            query_id="seed-query",
            prediction_target_date=self.cycle.prediction_target_date,
            last_analyzed_at=datetime(2026, 6, 13, 19, 0),
            news_fingerprint='["https://news.example/old"]',
        )
        self.shared_run_id = int(shared.id)

        with db.session_scope() as session:
            from src.storage import AnalysisHistory

            history = AnalysisHistory(
                query_id="seed-query",
                owner_user_id=self.admin_id,
                code="600519",
                name="贵州茅台",
                report_type="simple",
                sentiment_score=70,
                operation_advice="持有",
                trend_prediction="震荡",
                analysis_summary="cached summary",
                raw_result='{"current_price": 100}',
                news_content="https://news.example/old",
                created_at=datetime.now(),
                shared_run_id=self.shared_run_id,
            )
            session.add(history)
            session.flush()
            self.history_id = int(history.id)

        db.update_shared_analysis_run(
            self.shared_run_id,
            analysis_history_id=self.history_id,
        )

    def tearDown(self) -> None:
        SharedAnalysisService._instance = None
        CreditService._instance = None
        Config.reset_instance()
        DatabaseManager.reset_instance()
        if self._original_database_path is None:
            os.environ.pop("DATABASE_PATH", None)
        else:
            os.environ["DATABASE_PATH"] = self._original_database_path
        if self._original_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = self._original_database_url
        os.environ.pop("CREDITS_ANALYSIS_PROBE", None)
        self.temp_dir.cleanup()

    @patch("src.services.shared_analysis_service.probe_new_intel")
    @patch("src.services.shared_analysis_service.resolve_prediction_cycle")
    def test_cache_hit_charges_probe_credits(
        self,
        mock_resolve,
        mock_probe,
    ) -> None:
        mock_resolve.return_value = self.cycle
        mock_probe.return_value = IntelProbeResult(
            attempted=True,
            has_new_intel=False,
            search_failed=False,
        )

        outcome = SharedAnalysisService.get_instance().get_or_create(
            code="600519",
            report_type=ReportType.SIMPLE,
            owner_user_id=self.admin_id,
            charge_probe_credits=True,
            allow_intel_probe=True,
        )

        self.assertTrue(outcome.from_cache)
        self.assertEqual(outcome.probe_credits_charged, 3)
        self.assertEqual(outcome.history_id, self.history_id)
        self.assertEqual(CreditService.get_instance().get_balance(self.admin_id), 97)

    @patch("src.services.shared_analysis_service.probe_new_intel")
    @patch("src.services.shared_analysis_service.resolve_prediction_cycle")
    @patch("src.services.shared_analysis_service.StockAnalysisPipeline")
    def test_new_intel_triggers_full_analysis(
        self,
        mock_pipeline_cls,
        mock_resolve,
        mock_probe,
    ) -> None:
        mock_resolve.return_value = self.cycle
        mock_probe.return_value = IntelProbeResult(
            attempted=True,
            has_new_intel=True,
            new_urls=["https://news.example/new"],
        )

        mock_result = SimpleNamespace(
            success=True,
            code="600519",
            name="贵州茅台",
            sentiment_score=80,
            operation_advice="买入",
            trend_prediction="上涨",
            analysis_summary="fresh",
        )
        mock_pipeline_cls.return_value.process_single_stock.return_value = mock_result

        db = DatabaseManager.get_instance()
        with db.session_scope() as session:
            from src.storage import AnalysisHistory

            session.add(
                AnalysisHistory(
                    query_id="fresh-query",
                    owner_user_id=self.admin_id,
                    code="600519",
                    name="贵州茅台",
                    report_type="simple",
                    sentiment_score=80,
                    operation_advice="买入",
                    trend_prediction="上涨",
                    analysis_summary="fresh",
                    raw_result="{}",
                    created_at=datetime.now(),
                )
            )

        outcome = SharedAnalysisService.get_instance().get_or_create(
            code="600519",
            report_type=ReportType.SIMPLE,
            admin_user=self.admin_user,
            charge_probe_credits=True,
            allow_intel_probe=True,
        )

        self.assertFalse(outcome.from_cache)
        mock_pipeline_cls.return_value.process_single_stock.assert_called_once()

    @patch("src.services.shared_analysis_service.probe_new_intel")
    @patch("src.services.shared_analysis_service.resolve_prediction_cycle")
    @patch("src.services.shared_analysis_service.StockAnalysisPipeline")
    def test_concurrent_requests_wait_for_single_pipeline_run(
        self,
        mock_pipeline_cls,
        mock_resolve,
        mock_probe,
    ) -> None:
        mock_resolve.return_value = self.cycle
        mock_probe.return_value = IntelProbeResult(
            attempted=False,
            has_new_intel=False,
            search_failed=False,
        )

        pipeline_started = threading.Event()
        release_pipeline = threading.Event()

        def _slow_process(*_args, **_kwargs):
            pipeline_started.set()
            assert release_pipeline.wait(timeout=5.0)
            with db.session_scope() as session:
                from src.storage import AnalysisHistory

                session.add(
                    AnalysisHistory(
                        query_id="leader-query",
                        owner_user_id=self.admin_id,
                        code="601318",
                        name="中国平安",
                        report_type="simple",
                        sentiment_score=60,
                        operation_advice="持有",
                        trend_prediction="震荡",
                        analysis_summary="leader",
                        raw_result="{}",
                        created_at=datetime.now(),
                    )
                )
            return SimpleNamespace(
                success=True,
                code="601318",
                name="中国平安",
                sentiment_score=60,
                operation_advice="持有",
                trend_prediction="震荡",
                analysis_summary="leader",
            )

        mock_pipeline_cls.return_value.process_single_stock.side_effect = _slow_process

        db = DatabaseManager.get_instance()
        user_b = db.create_user(
            username="user_b",
            password_salt=b"salt",
            password_hash=b"hash",
        )
        user_b_id = int(user_b.id)

        outcomes: dict[str, SharedAnalysisOutcome] = {}
        errors: dict[str, Exception] = {}

        def _run(owner_id: int, key: str) -> None:
            try:
                outcomes[key] = SharedAnalysisService.get_instance().get_or_create(
                    code="601318",
                    report_type=ReportType.SIMPLE,
                    owner_user_id=owner_id,
                    allow_intel_probe=False,
                    charge_probe_credits=False,
                    admin_user=self.admin_user,
                )
            except Exception as exc:
                errors[key] = exc

        follower = threading.Thread(target=_run, args=(user_b_id, "b"), daemon=True)
        leader = threading.Thread(target=_run, args=(self.admin_id, "a"), daemon=True)
        leader.start()
        self.assertTrue(pipeline_started.wait(timeout=30.0))
        follower.start()
        release_pipeline.set()
        leader.join(timeout=30.0)
        follower.join(timeout=30.0)

        self.assertEqual(errors, {})
        self.assertIn("a", outcomes)
        self.assertIn("b", outcomes)
        self.assertIsNotNone(outcomes["a"].history_id)
        self.assertIsNotNone(outcomes["b"].history_id)
        self.assertTrue(outcomes["b"].from_cache)
        self.assertEqual(
            mock_pipeline_cls.return_value.process_single_stock.call_count,
            1,
        )
        self.assertNotEqual(outcomes["a"].history_id, outcomes["b"].history_id)

    @patch("src.services.shared_analysis_service.resolve_prediction_cycle")
    def test_lookup_cycle_report_exists(self, mock_resolve) -> None:
        mock_resolve.return_value = self.cycle
        payload = SharedAnalysisService.get_instance().lookup_cycle_report(
            code="600519",
            report_type=ReportType.SIMPLE,
            owner_user_id=self.admin_id,
        )
        self.assertTrue(payload["exists"])
        self.assertEqual(payload["history_id"], self.history_id)
        self.assertEqual(payload["version"], 1)

    @patch("src.services.shared_analysis_service.resolve_prediction_cycle")
    def test_lookup_cycle_report_does_not_materialize_other_users_report(self, mock_resolve) -> None:
        mock_resolve.return_value = self.cycle
        db = DatabaseManager.get_instance()
        other, err = register_user("other_viewer", "password123")
        self.assertIsNone(err)
        assert other is not None
        other_id = int(other["id"])

        payload = SharedAnalysisService.get_instance().lookup_cycle_report(
            code="600519",
            report_type=ReportType.SIMPLE,
            owner_user_id=other_id,
            materialize=False,
        )

        with db.session_scope() as session:
            from sqlalchemy import func, select
            from src.storage import AnalysisHistory

            count = session.execute(
                select(func.count())
                .select_from(AnalysisHistory)
                .where(AnalysisHistory.owner_user_id == other_id)
            ).scalar_one()

        self.assertFalse(payload["exists"])
        self.assertIsNone(payload.get("history_id"))
        self.assertEqual(int(count), 0)

    @patch("src.services.prediction_report_market_service.resolve_prediction_cycle")
    @patch("src.services.shared_analysis_service.resolve_prediction_cycle")
    def test_get_or_create_requires_purchase_when_market_listing_exists(
        self,
        mock_shared_resolve,
        mock_market_resolve,
    ) -> None:
        mock_shared_resolve.return_value = self.cycle
        mock_market_resolve.return_value = self.cycle
        PredictionReportMarketService._instance = None
        other, err = register_user("buyer_market", "password123")
        self.assertIsNone(err)
        assert other is not None
        other_id = int(other["id"])

        PredictionReportMarketService.get_instance().recommend_report(
            owner_user_id=self.admin_id,
            history_id=self.history_id,
        )

        with self.assertRaises(SharedAnalysisPurchaseRequiredError):
            SharedAnalysisService.get_instance().get_or_create(
                code="600519",
                report_type=ReportType.SIMPLE,
                owner_user_id=other_id,
            )

    @patch("src.services.shared_analysis_service.probe_new_intel")
    @patch("src.services.shared_analysis_service.resolve_prediction_cycle")
    def test_cache_hit_without_probe_by_default(
        self,
        mock_resolve,
        mock_probe,
    ) -> None:
        mock_resolve.return_value = self.cycle
        outcome = SharedAnalysisService.get_instance().get_or_create(
            code="600519",
            report_type=ReportType.SIMPLE,
            owner_user_id=self.admin_id,
        )
        self.assertTrue(outcome.from_cache)
        self.assertEqual(outcome.probe_credits_charged, 0)
        mock_probe.assert_not_called()

    @patch("src.services.shared_analysis_service.resolve_prediction_cycle")
    @patch("src.services.shared_analysis_service.StockAnalysisPipeline")
    def test_refresh_intel_uses_snapshot_pipeline(
        self,
        mock_pipeline_cls,
        mock_resolve,
    ) -> None:
        mock_resolve.return_value = self.cycle
        db = DatabaseManager.get_instance()
        snapshot = {
            "enhanced_context": {
                "code": "600519",
                "stock_name": "贵州茅台",
                "fundamental_context": {"status": "partial"},
            },
            "news_content": "old news",
        }
        snapshot_row = db.upsert_stock_data_snapshot(
            code="600519",
            cycle_anchor_date=self.cycle.cycle_anchor_date,
            market="cn",
            payload=snapshot,
        )
        db.update_shared_analysis_run(
            self.shared_run_id,
            data_snapshot_id=int(snapshot_row.id),
        )

        mock_result = SimpleNamespace(
            success=True,
            code="600519",
            name="贵州茅台",
            sentiment_score=82,
            operation_advice="持有",
            trend_prediction="震荡",
            analysis_summary="refreshed",
        )
        mock_pipeline_cls.return_value.refresh_intel_from_snapshot.return_value = mock_result

        with db.session_scope() as session:
            from src.storage import AnalysisHistory

            session.add(
                AnalysisHistory(
                    query_id="refresh-query",
                    owner_user_id=self.admin_id,
                    code="600519",
                    name="贵州茅台",
                    report_type="simple",
                    sentiment_score=82,
                    operation_advice="持有",
                    trend_prediction="震荡",
                    analysis_summary="refreshed",
                    raw_result="{}",
                    created_at=datetime.now(),
                )
            )

        outcome = SharedAnalysisService.get_instance().get_or_create(
            code="600519",
            report_type=ReportType.SIMPLE,
            admin_user=self.admin_user,
            analysis_mode="refresh_intel",
        )

        self.assertFalse(outcome.from_cache)
        mock_pipeline_cls.return_value.refresh_intel_from_snapshot.assert_called_once()
        mock_pipeline_cls.return_value.process_single_stock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
