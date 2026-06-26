# -*- coding: utf-8 -*-
"""Tests for macro focus brief service."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from src.services.macro_focus_brief_service import MacroFocusBriefService, prepend_macro_focus_brief


class TestMacroFocusBriefService(unittest.TestCase):
    def setUp(self):
        MacroFocusBriefService.reset_instance_for_tests()

    def tearDown(self):
        MacroFocusBriefService.reset_instance_for_tests()

    @patch("src.services.macro_focus_brief_service.get_config")
    def test_disabled_when_feature_off(self, mock_get_config):
        mock_get_config.return_value = MagicMock(
            macro_focus_brief_enabled=False,
            macro_focus_brief_ttl_seconds=1800,
            macro_focus_brief_max_items=0,
            macro_focus_brief_file="focus/tushare_focus_news_{date}.json",
        )
        service = MacroFocusBriefService()
        self.assertFalse(service.is_enabled())
        self.assertIsNone(service.get_brief_text())

    @patch("src.services.macro_focus_brief_service._REPO_ROOT", new_callable=lambda: Path("."))
    @patch("src.services.macro_focus_brief_service.get_config")
    def test_formats_focus_brief_from_file(self, mock_get_config, _mock_repo_root):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            focus_dir = root / "focus"
            focus_dir.mkdir()
            focus_file = focus_dir / "tushare_focus_news_20260625.json"
            focus_file.write_text(
                json.dumps(
                    {
                        "channel": "焦点",
                        "total": 2,
                        "news": [
                            {"datetime": "15:01", "content": "美联储官员发表鸽派讲话"},
                            {"datetime": "14:30", "content": "国际油价因地缘担忧反弹"},
                        ],
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            import src.services.macro_focus_brief_service as service_module

            service_module._REPO_ROOT = root
            mock_get_config.return_value = MagicMock(
                macro_focus_brief_enabled=True,
                macro_focus_brief_ttl_seconds=1800,
                macro_focus_brief_max_items=0,
                macro_focus_brief_file="focus/tushare_focus_news_{date}.json",
            )

            with patch.object(
                MacroFocusBriefService,
                "_resolve_focus_file_path",
                return_value=focus_file,
            ):
                service = MacroFocusBriefService()
                text = service.get_brief_text(force_refresh=True)

            self.assertIn("宏观环境 · 新浪焦点", text or "")
            self.assertIn("共 2 条", text or "")
            self.assertIn("美联储官员发表鸽派讲话", text or "")
            self.assertIn("国际油价因地缘担忧反弹", text or "")

    @patch("src.services.macro_focus_brief_service.get_config")
    def test_cache_reuses_payload(self, mock_get_config):
        from src.services.macro_focus_brief_service import MacroFocusItem

        mock_get_config.return_value = MagicMock(
            macro_focus_brief_enabled=True,
            macro_focus_brief_ttl_seconds=1800,
            macro_focus_brief_max_items=0,
            macro_focus_brief_file="focus/tushare_focus_news_{date}.json",
        )
        service = MacroFocusBriefService()
        with patch.object(
            service,
            "_load_focus_items_from_file",
            return_value=(
                [MacroFocusItem(datetime="15:01", title="测试焦点")],
                Path("focus/tushare_focus_news_20260625.json"),
                "2026-06-25 13:00:00",
            ),
        ) as mock_load:
            first = service.get_brief_text(force_refresh=True)
            second = service.get_brief_text()
        self.assertEqual(first, second)
        self.assertEqual(mock_load.call_count, 1)

    @patch("src.services.macro_focus_brief_service.get_config")
    def test_missing_file_returns_none(self, mock_get_config):
        mock_get_config.return_value = MagicMock(
            macro_focus_brief_enabled=True,
            macro_focus_brief_ttl_seconds=1800,
            macro_focus_brief_max_items=0,
            macro_focus_brief_file="focus/missing_{date}.json",
        )
        service = MacroFocusBriefService()
        with patch.object(
            service,
            "_resolve_focus_file_path",
            return_value=Path("/tmp/does-not-exist.json"),
        ):
            self.assertIsNone(service.get_brief_text(force_refresh=True))

    @patch("src.services.macro_focus_brief_service.get_config")
    def test_max_items_limits_output(self, mock_get_config):
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False, suffix=".json") as handle:
            json.dump(
                {
                    "news": [
                        {"datetime": "15:01", "content": "A"},
                        {"datetime": "15:00", "content": "B"},
                        {"datetime": "14:59", "content": "C"},
                    ]
                },
                handle,
                ensure_ascii=False,
            )
            focus_file = Path(handle.name)

        mock_get_config.return_value = MagicMock(
            macro_focus_brief_enabled=True,
            macro_focus_brief_ttl_seconds=60,
            macro_focus_brief_max_items=2,
            macro_focus_brief_file="focus/tushare_focus_news_{date}.json",
        )
        service = MacroFocusBriefService()
        try:
            with patch.object(service, "_resolve_focus_file_path", return_value=focus_file):
                items, path, mtime = service._load_focus_items_from_file()
            self.assertEqual(len(items), 2)
            self.assertEqual(items[0].title, "A")
            self.assertEqual(items[1].title, "B")
        finally:
            focus_file.unlink(missing_ok=True)

    @patch("src.services.macro_focus_brief_service.MacroFocusBriefService.get_brief_text")
    def test_prepend_macro_focus_brief(self, mock_get_brief):
        mock_get_brief.return_value = "【宏观环境 · 新浪焦点】\n1. [14:00] 测试"
        merged = prepend_macro_focus_brief("【个股情报】\n新闻A")
        self.assertTrue(merged.startswith("【宏观环境 · 新浪焦点】"))
        self.assertIn("【个股情报】", merged or "")

    @patch("src.services.macro_focus_brief_service.MacroFocusBriefService.get_brief_text")
    def test_prepend_replaces_existing_macro_block(self, mock_get_brief):
        mock_get_brief.return_value = "【宏观环境 · 新浪焦点】\n更新时间：new"
        merged = prepend_macro_focus_brief(
            "【宏观环境 · 新浪焦点】\n更新时间：old\n\n【个股情报】\n新闻A"
        )
        self.assertEqual(
            merged,
            "【宏观环境 · 新浪焦点】\n更新时间：new\n\n【个股情报】\n新闻A",
        )

    @patch("src.services.macro_focus_brief_service.MacroFocusBriefService.get_brief_text")
    def test_ensure_macro_focus_in_agent_context(self, mock_get_brief):
        from src.services.macro_focus_brief_service import ensure_macro_focus_in_agent_context

        mock_get_brief.return_value = "【宏观环境 · 新浪焦点】\n1. [14:00] 测试"
        out = ensure_macro_focus_in_agent_context({"stock_code": "600519"})
        self.assertIn("news_context", out)
        self.assertIn("宏观环境", out["news_context"])


if __name__ == "__main__":
    unittest.main()
