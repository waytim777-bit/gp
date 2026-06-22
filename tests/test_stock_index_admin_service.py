# -*- coding: utf-8 -*-
"""Tests for stock index admin service."""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from src.services.stock_index_admin_service import StockIndexAdminService


class StockIndexAdminServiceTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.service = StockIndexAdminService.get_instance()

    def test_get_status_reads_index_stats(self) -> None:
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            static_index = root / "static" / "stocks.index.json"
            static_index.parent.mkdir(parents=True)
            static_index.write_text(
                json.dumps([
                    ["603407.SH", "603407", "长裕集团", "changyujituan", "cyjt", [], "CN", "stock", True, 100],
                ]),
                encoding="utf-8",
            )
            with patch("src.services.stock_index_admin_service._INDEX_STATIC", static_index), patch(
                "src.services.stock_index_admin_service._INDEX_PUBLIC",
                root / "public" / "stocks.index.json",
            ), patch.object(
                self.service,
                "_resolve_index_path",
                return_value=static_index,
            ):
                status = self.service.get_status(lookup="长裕")
        self.assertEqual(status["indexStats"]["total"], 1)
        self.assertEqual(status["lookupResults"][0]["displayCode"], "603407")

    def test_publish_index_copies_to_static(self) -> None:
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            public_index = root / "public" / "stocks.index.json"
            static_index = root / "static" / "stocks.index.json"
            public_index.parent.mkdir(parents=True)
            public_index.write_text("[]", encoding="utf-8")
            with patch("src.services.stock_index_admin_service._INDEX_PUBLIC", public_index), patch(
                "src.services.stock_index_admin_service._INDEX_STATIC",
                static_index,
            ), patch(
                "src.services.stock_index_admin_service.clear_stock_index_cache_for_admin",
            ) as clear_cache:
                result = self.service.publish_index()
            self.assertTrue(static_index.is_file())
            self.assertEqual(result["targetPath"], str(static_index))
            clear_cache.assert_called_once()

    def test_child_process_env_uses_utf8(self) -> None:
        env = StockIndexAdminService._child_process_env()
        self.assertEqual(env["PYTHONIOENCODING"], "utf-8")
        self.assertEqual(env["PYTHONUTF8"], "1")

    def test_generate_index_publishes_when_not_test_mode(self) -> None:
        script_result = {"success": True, "exitCode": 0, "stdout": "ok", "stderr": ""}
        publish_result = {"targetPath": "/tmp/static/stocks.index.json"}
        with patch.object(self.service, "_run_script", return_value=script_result), patch.object(
            self.service,
            "publish_index",
            return_value=publish_result,
        ) as publish_mock, patch.object(
            self.service,
            "get_status",
            return_value={"indexStats": {"total": 1, "markets": {"CN": 1}}},
        ):
            payload = self.service.generate_index(test_mode=False)
        publish_mock.assert_called_once()
        self.assertEqual(payload["publish"], publish_result)


if __name__ == "__main__":
    unittest.main()
