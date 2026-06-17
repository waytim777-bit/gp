# -*- coding: utf-8 -*-
"""Tests for subscription profile and CRUD service."""

import os
import tempfile
import unittest
from pathlib import Path

from src.auth import register_user
from src.config import Config
from src.services.subscription_service import SubscriptionService, SubscriptionValidationError
from src.storage import DatabaseManager


class SubscriptionServiceTestCase(unittest.TestCase):
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
        self.service = SubscriptionService.get_instance()
        user, err = register_user("sub_user", "password123")
        self.assertIsNone(err)
        assert user is not None
        self.user_id = int(user["id"])

    def tearDown(self) -> None:
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

    def test_save_profile_requires_destination(self) -> None:
        with self.assertRaises(SubscriptionValidationError):
            self.service.save_profile(self.user_id, notification_email="", webhook_urls="")

    def test_create_and_list_subscription(self) -> None:
        self.service.save_profile(
            self.user_id,
            notification_email="user@example.com",
            webhook_urls="",
        )
        created = self.service.create_subscription(
            self.user_id,
            code="600519",
            name="贵州茅台",
            interval_days=3,
        )
        self.assertEqual(created["code"], "600519")
        self.assertEqual(created["interval_days"], 3)
        payload = self.service.list_subscriptions(self.user_id)
        self.assertEqual(payload["total"], 1)
        self.assertEqual(payload["active_count"], 1)

    def test_duplicate_subscription_rejected(self) -> None:
        self.service.create_subscription(
            self.user_id,
            code="600519",
            name=None,
            interval_days=1,
        )
        with self.assertRaises(SubscriptionValidationError):
            self.service.create_subscription(
                self.user_id,
                code="600519",
                name=None,
                interval_days=1,
            )


if __name__ == "__main__":
    unittest.main()
