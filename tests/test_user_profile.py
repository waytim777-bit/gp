# -*- coding: utf-8 -*-
"""Tests for user profile updates."""

import os
import tempfile
import unittest
from pathlib import Path

from src.auth import (
    change_web_user_password,
    get_user_profile,
    register_user,
    update_user_profile,
)
from src.config import Config
from src.storage import DatabaseManager


class UserProfileTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temp_dir.name)
        self._original_database_path = os.environ.get("DATABASE_PATH")
        self._original_database_url = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_PATH"] = str(self.data_dir / "test.db")
        os.environ.pop("DATABASE_URL", None)
        Config.reset_instance()
        DatabaseManager.reset_instance()

        user, err = register_user("profile_user", "password123")
        self.assertIsNone(err)
        assert user is not None
        self.user_id = int(user["id"])

    def tearDown(self) -> None:
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
        self.temp_dir.cleanup()

    def test_update_username_and_avatar(self) -> None:
        payload, err = update_user_profile(
            self.user_id,
            username="new_nick",
            avatar_url="https://example.com/avatar.png",
        )
        self.assertIsNone(err)
        assert payload is not None
        self.assertEqual(payload["username"], "new_nick")
        self.assertEqual(payload["avatarUrl"], "https://example.com/avatar.png")

        profile = get_user_profile(self.user_id)
        assert profile is not None
        self.assertEqual(profile["username"], "new_nick")

    def test_change_web_user_password(self) -> None:
        err = change_web_user_password(self.user_id, "password123", "newpass456")
        self.assertIsNone(err)

        from src.auth import authenticate_user

        self.assertIsNone(authenticate_user("profile_user", "password123"))
        self.assertIsNotNone(authenticate_user("profile_user", "newpass456"))


if __name__ == "__main__":
    unittest.main()
