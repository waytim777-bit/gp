# -*- coding: utf-8 -*-
"""Tests for subscription push runner (analyze + deliver workflow)."""

import os
import tempfile
import unittest
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from src.auth import register_user
from src.config import Config
from src.services.credit_service import CreditService
from src.services.subscription_runner import SubscriptionRunner
from src.services.subscription_service import SubscriptionService
from src.storage import DatabaseManager


class SubscriptionRunnerTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temp_dir.name)
        self._original_env_file = os.environ.get("ENV_FILE")
        self._original_database_path = os.environ.get("DATABASE_PATH")
        self._original_database_url = os.environ.get("DATABASE_URL")
        self.env_path = self.data_dir / ".env"
        self.env_path.write_text("GEMINI_API_KEY=test\n", encoding="utf-8")
        os.environ["ENV_FILE"] = str(self.env_path)
        os.environ["DATABASE_PATH"] = str(self.data_dir / "test.db")
        os.environ.pop("DATABASE_URL", None)
        os.environ["SUBSCRIPTION_CREDITS_PER_PUSH"] = "10"
        Config.reset_instance()
        DatabaseManager.reset_instance()
        CreditService._instance = None

        self.subscription_service = SubscriptionService.get_instance()
        user, err = register_user("runner_user", "password123")
        self.assertIsNone(err)
        assert user is not None
        self.user_id = int(user["id"])

        db = DatabaseManager.get_instance()
        db.add_credit_transaction(user_id=self.user_id, credit_amount=100, reason="test top-up")
        self.subscription_service.save_profile(
            self.user_id,
            notification_email="runner@example.com",
            webhook_urls="",
        )
        self.subscription = self.subscription_service.create_subscription(
            self.user_id,
            code="600519",
            name="贵州茅台",
            interval_days=1,
        )
        self.analysis_date = date(2026, 6, 9)
        db.update_stock_subscription(
            int(self.subscription["id"]),
            self.user_id,
            next_push_on=self.analysis_date,
        )

    def tearDown(self) -> None:
        SubscriptionRunner._instance = None
        CreditService._instance = None
        Config.reset_instance()
        DatabaseManager.reset_instance()
        if self._original_env_file is None:
            os.environ.pop("ENV_FILE", None)
        else:
            os.environ["ENV_FILE"] = self._original_env_file
        if self._original_database_path is None:
            os.environ.pop("DATABASE_PATH", None)
        else:
            os.environ["DATABASE_PATH"] = self._original_database_path
        if self._original_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = self._original_database_url
        os.environ.pop("SUBSCRIPTION_CREDITS_PER_PUSH", None)
        self.temp_dir.cleanup()

    def test_deliver_due_success_charges_credits_and_logs_push(self) -> None:
        shared_run = SimpleNamespace(id=1, analysis_history_id=99)

        cycle = SimpleNamespace(cycle_anchor_date=self.analysis_date)

        with patch(
            "src.services.subscription_runner.resolve_prediction_cycle",
            return_value=cycle,
        ), patch.object(
            DatabaseManager.get_instance(),
            "get_shared_analysis_run",
            return_value=shared_run,
        ), patch.object(
            SubscriptionRunner,
            "_build_report_from_history",
            return_value="# mock report",
        ), patch(
            "src.services.subscription_runner.deliver_subscription_report",
            return_value=(True, "email"),
        ):
            summary = SubscriptionRunner.get_instance().deliver_due()

        self.assertEqual(summary["due_count"], 1)
        self.assertEqual(summary["pushes_success"], 1)
        self.assertEqual(summary["credits_charged"], 10)

        balance = CreditService.get_instance().get_balance(self.user_id)
        self.assertEqual(balance, 90)

        logs = self.subscription_service.list_push_logs(self.user_id, limit=5)
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0]["status"], "success")

    def test_deliver_due_skips_when_insufficient_credits(self) -> None:
        db = DatabaseManager.get_instance()
        db.add_credit_transaction(user_id=self.user_id, credit_amount=-100, reason="drain")
        shared_run = SimpleNamespace(id=2, analysis_history_id=99)

        cycle = SimpleNamespace(cycle_anchor_date=self.analysis_date)

        with patch(
            "src.services.subscription_runner.resolve_prediction_cycle",
            return_value=cycle,
        ), patch.object(
            DatabaseManager.get_instance(),
            "get_shared_analysis_run",
            return_value=shared_run,
        ), patch.object(
            SubscriptionRunner,
            "_build_report_from_history",
            return_value="# mock report",
        ), patch(
            "src.services.subscription_runner.deliver_subscription_report",
        ) as deliver_mock:
            summary = SubscriptionRunner.get_instance().deliver_due()

        deliver_mock.assert_not_called()
        self.assertEqual(summary["pushes_skipped"], 1)


if __name__ == "__main__":
    unittest.main()
