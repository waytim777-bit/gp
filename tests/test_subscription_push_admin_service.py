# -*- coding: utf-8 -*-
"""Tests for admin subscription push overview."""

import os
import tempfile
import unittest
from pathlib import Path

from src.auth import register_user
from src.config import Config
from src.services.subscription_push_admin_service import SubscriptionPushAdminService
from src.services.subscription_service import SubscriptionService
from src.storage import DatabaseManager


class SubscriptionPushAdminServiceTestCase(unittest.TestCase):
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
        Config.reset_instance()
        DatabaseManager.reset_instance()
        SubscriptionPushAdminService._instance = None

        self.subscription_service = SubscriptionService.get_instance()
        user, err = register_user("admin_overview_user", "password123")
        self.assertIsNone(err)
        assert user is not None
        self.user_id = int(user["id"])
        self.subscription_service.save_profile(
            self.user_id,
            notification_email="user@example.com",
            webhook_urls="https://example.com/hook",
        )
        self.subscription_service.create_subscription(
            self.user_id,
            code="600519",
            name="贵州茅台",
            interval_days=1,
        )

    def tearDown(self) -> None:
        SubscriptionPushAdminService._instance = None
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
        self.temp_dir.cleanup()

    def test_get_overview_includes_webhook_flag(self) -> None:
        from api.v1.endpoints.admin_subscription_push import SubscriptionOverviewResponse

        overview = SubscriptionPushAdminService.get_instance().get_overview()
        validated = SubscriptionOverviewResponse.model_validate(overview)
        self.assertEqual(validated.stats.total_subscriptions, 1)
        self.assertTrue(overview["rows"][0]["hasWebhook"])
        self.assertEqual(overview["rows"][0]["notificationEmail"], "user@example.com")
        self.assertIn("recentLogs", overview)


if __name__ == "__main__":
    unittest.main()
