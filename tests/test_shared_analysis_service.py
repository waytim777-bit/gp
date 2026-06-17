# -*- coding: utf-8 -*-
"""Tests for SharedAnalysisService cache + probe flow."""

import os
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from src.config import Config
from src.core.prediction_cycle import PredictionCycle
from src.enums import ReportType
from src.services.credit_service import CreditService
from src.services.intel_probe_service import IntelProbeResult
from src.services.shared_analysis_service import SharedAnalysisService
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
        )

        self.assertFalse(outcome.from_cache)
        mock_pipeline_cls.return_value.process_single_stock.assert_called_once()


if __name__ == "__main__":
    unittest.main()
