# -*- coding: utf-8 -*-
"""Tests for public report share links."""

import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from src.config import Config
from src.services.report_public_share_service import ReportPublicShareError, ReportPublicShareService
from src.storage import AnalysisHistory, DatabaseManager


class ReportPublicShareServiceTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self._original_database_path = os.environ.get("DATABASE_PATH")
        self._original_database_url = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_PATH"] = str(Path(self.temp_dir.name) / "test.db")
        os.environ.pop("DATABASE_URL", None)
        Config.reset_instance()
        DatabaseManager.reset_instance()
        ReportPublicShareService._instance = None

        db = DatabaseManager.get_instance()
        self.owner_id = int(db.ensure_default_admin_user())
        with db.session_scope() as session:
            history = AnalysisHistory(
                query_id="share-test",
                owner_user_id=self.owner_id,
                code="600519",
                name="贵州茅台",
                report_type="detailed",
                sentiment_score=70,
                operation_advice="持有",
                trend_prediction="看多",
                analysis_summary="测试摘要",
                raw_result='{"report_language": "zh", "analysis_summary": "测试"}',
                context_snapshot='{"report_language": "zh"}',
                created_at=datetime.now(),
            )
            session.add(history)
            session.flush()
            self.history_id = int(history.id)

        self.service = ReportPublicShareService.get_instance()

    def tearDown(self) -> None:
        if self._original_database_path is None:
            os.environ.pop("DATABASE_PATH", None)
        else:
            os.environ["DATABASE_PATH"] = self._original_database_path
        if self._original_database_url is not None:
            os.environ["DATABASE_URL"] = self._original_database_url
        try:
            self.temp_dir.cleanup()
        except PermissionError:
            pass
        Config.reset_instance()
        DatabaseManager.reset_instance()
        ReportPublicShareService._instance = None

    def test_enable_and_fetch_public_report(self) -> None:
        link = self.service.enable_share(
            owner_user_id=self.owner_id,
            history_id=self.history_id,
        )
        self.assertTrue(link["share_token"])
        self.assertTrue(link["share_path"].startswith("/r/"))

        payload = self.service.get_public_report(link["share_token"])
        self.assertEqual(payload["share_token"], link["share_token"])
        self.assertIn("markdown", payload)
        self.assertEqual(payload["report"]["meta"]["stock_code"], "600519")

    def test_invalid_token_raises(self) -> None:
        with self.assertRaises(ReportPublicShareError):
            self.service.get_public_report("not-a-real-token")


if __name__ == "__main__":
    unittest.main()
