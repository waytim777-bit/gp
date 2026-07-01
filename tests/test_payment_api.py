# -*- coding: utf-8 -*-
"""Integration tests for payment API authorization."""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

# Keep this test runnable when optional LLM runtime deps are not installed.
try:
    import litellm  # noqa: F401
except ModuleNotFoundError:
    sys.modules["litellm"] = MagicMock()

import src.auth as auth
from api.app import create_app
from src.config import Config
from src.storage import CreditDeduction, CreditTransaction, DatabaseManager


def _reset_auth_globals() -> None:
    auth._session_secret = None
    auth._rate_limit = {}


class PaymentApiAuthTestCase(unittest.TestCase):
    """Payment APIs are account features, not menu-permission-gated pages."""

    def setUp(self) -> None:
        _reset_auth_globals()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temp_dir.name)
        self.db_path = self.data_dir / "test.db"
        self._original_env_file = os.environ.get("ENV_FILE")
        self._original_database_path = os.environ.get("DATABASE_PATH")
        self._original_database_url = os.environ.get("DATABASE_URL")
        self.env_path = self.data_dir / ".env"
        self.env_path.write_text(
            "STOCK_LIST=600519\nGEMINI_API_KEY=test\n",
            encoding="utf-8",
        )

        os.environ["ENV_FILE"] = str(self.env_path)
        os.environ["DATABASE_PATH"] = str(self.db_path)
        os.environ.pop("DATABASE_URL", None)
        Config.reset_instance()
        DatabaseManager.reset_instance()
        self.data_dir_patcher = patch.object(auth, "_get_data_dir", return_value=self.data_dir)
        self.data_dir_patcher.start()

        self.app = create_app(static_dir=self.data_dir / "empty-static")
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        self.data_dir_patcher.stop()
        DatabaseManager.reset_instance()
        Config.reset_instance()
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

    def test_payment_history_requires_login(self) -> None:
        response = TestClient(self.app).get("/api/v1/payment/history")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"], "unauthorized")

    def test_user_without_payment_menu_permission_can_view_own_history(self) -> None:
        register_response = self.client.post(
            "/api/v1/auth/register",
            json={
                "username": "test",
                "password": "password123",
                "passwordConfirm": "password123",
            },
        )
        self.assertEqual(register_response.status_code, 200)

        status_response = self.client.get("/api/v1/auth/status")
        self.assertEqual(status_response.status_code, 200)
        current_user = status_response.json()["currentUser"]
        self.assertNotIn("payment", current_user["menuPermissions"])

        history_response = self.client.get("/api/v1/payment/history")

        self.assertEqual(history_response.status_code, 200)
        self.assertEqual(
            history_response.json(),
            {
                "deposits": [],
                "deductions": [],
                "items": [],
                "total": 0,
                "page": 1,
                "page_size": 20,
                "total_pages": 0,
            },
        )

    def test_payment_history_paginates_combined_transactions(self) -> None:
        register_response = self.client.post(
            "/api/v1/auth/register",
            json={
                "username": "history-user",
                "password": "password123",
                "passwordConfirm": "password123",
            },
        )
        self.assertEqual(register_response.status_code, 200)
        status_response = self.client.get("/api/v1/auth/status")
        user_id = status_response.json()["currentUser"]["id"]

        now = datetime(2026, 1, 1, 12, 0, 0)
        db = DatabaseManager.get_instance()
        with db.session_scope() as session:
            session.add(
                CreditTransaction(
                    user_id=user_id,
                    credit_amount=100,
                    reason="oldest-deposit",
                    created_at=now,
                )
            )
            session.add(
                CreditDeduction(
                    user_id=user_id,
                    call_type="analysis",
                    model="test-model",
                    total_tokens=1000,
                    credits_spent=10,
                    balance_after=90,
                    created_at=now + timedelta(minutes=1),
                )
            )
            session.add(
                CreditTransaction(
                    user_id=user_id,
                    credit_amount=200,
                    reason="newer-deposit",
                    created_at=now + timedelta(minutes=2),
                )
            )

        response = self.client.get("/api/v1/payment/history?page=2&page_size=2")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["total"], 3)
        self.assertEqual(body["page"], 2)
        self.assertEqual(body["page_size"], 2)
        self.assertEqual(body["total_pages"], 2)
        self.assertEqual(len(body["items"]), 1)
        self.assertEqual(body["items"][0]["kind"], "deposit")
        self.assertEqual(body["items"][0]["reason"], "oldest-deposit")
        self.assertEqual(body["items"][0]["credit_amount"], 100)


if __name__ == "__main__":
    unittest.main()
