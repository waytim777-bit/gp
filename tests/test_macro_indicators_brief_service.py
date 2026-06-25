# -*- coding: utf-8 -*-
"""Tests for structured macro indicators brief service."""

import time
import unittest
from unittest.mock import MagicMock, patch

import pandas as pd

from src.services.macro_indicators_brief_service import (
    MacroIndicatorsBriefService,
    prepend_macro_environment_brief,
    prepend_macro_indicators_brief,
)


class TestMacroIndicatorsBriefService(unittest.TestCase):
    def setUp(self):
        MacroIndicatorsBriefService.reset_instance_for_tests()

    def tearDown(self):
        MacroIndicatorsBriefService.reset_instance_for_tests()

    @patch("src.services.macro_indicators_brief_service.get_config")
    def test_disabled_without_token(self, mock_get_config):
        mock_get_config.return_value = MagicMock(
            tushare_token=None,
            macro_indicators_brief_enabled=True,
            macro_indicators_brief_ttl_seconds=3600,
            macro_indicators_brief_include_cn_m=True,
            macro_indicators_brief_include_cn_gdp=True,
            macro_indicators_brief_include_us_trycr=True,
        )
        service = MacroIndicatorsBriefService()
        self.assertFalse(service.is_enabled())
        self.assertIsNone(service.get_brief_text())

    @patch("src.services.macro_indicators_brief_service.MacroIndicatorsBriefService._build_client")
    @patch("src.services.macro_indicators_brief_service.get_config")
    def test_formats_indicator_brief(self, mock_get_config, mock_build_client):
        mock_get_config.return_value = MagicMock(
            tushare_token="token",
            macro_indicators_brief_enabled=True,
            macro_indicators_brief_ttl_seconds=3600,
            macro_indicators_brief_include_cn_m=True,
            macro_indicators_brief_include_cn_gdp=True,
            macro_indicators_brief_include_us_trycr=True,
        )
        client = MagicMock()
        mock_build_client.return_value = client
        client.query.side_effect = [
            pd.DataFrame(
                [{"month": "202605", "m1_yoy": 5.2, "m2_yoy": 8.1}],
            ),
            pd.DataFrame(
                [{"quarter": "2025Q4", "gdp_yoy": 5.0, "pi_yoy": 3.5, "si_yoy": 4.8, "ti_yoy": 5.5}],
            ),
            pd.DataFrame(
                [
                    {"date": "20260601", "y10": 1.95},
                    {"date": "20260501", "y10": 2.05},
                ],
            ),
        ]

        text = MacroIndicatorsBriefService().get_brief_text()
        self.assertIn("【宏观环境 · 结构化指标】", text or "")
        self.assertIn("M2同比", text or "")
        self.assertIn("GDP（2025Q4）", text or "")
        self.assertIn("美债实际收益率", text or "")

    @patch("src.services.macro_indicators_brief_service.MacroIndicatorsBriefService.get_brief_text")
    def test_prepend_macro_indicators_brief(self, mock_get_brief):
        mock_get_brief.return_value = "【宏观环境 · 结构化指标】\nM2"
        merged = prepend_macro_indicators_brief("【个股情报】\n新闻A")
        self.assertTrue(merged.startswith("【宏观环境 · 结构化指标】"))
        self.assertIn("新闻A", merged)

    @patch("src.services.macro_focus_brief_service.MacroFocusBriefService.get_brief_text")
    @patch("src.services.macro_indicators_brief_service.MacroIndicatorsBriefService.get_brief_text")
    def test_prepend_macro_environment_order(self, mock_indicators, mock_focus):
        mock_indicators.return_value = "【宏观环境 · 结构化指标】\nM2"
        mock_focus.return_value = "【宏观环境 · 新浪焦点】\n焦点1"
        merged = prepend_macro_environment_brief("个股新闻")
        self.assertLess(merged.index("新浪焦点"), merged.index("结构化指标"))
        self.assertIn("个股新闻", merged)

    @patch("src.services.macro_indicators_brief_service.MacroIndicatorsBriefService._build_client")
    @patch("src.services.macro_indicators_brief_service.get_config")
    def test_cache_hit(self, mock_get_config, mock_build_client):
        mock_get_config.return_value = MagicMock(
            tushare_token="token",
            macro_indicators_brief_enabled=True,
            macro_indicators_brief_ttl_seconds=3600,
            macro_indicators_brief_include_cn_m=True,
            macro_indicators_brief_include_cn_gdp=False,
            macro_indicators_brief_include_us_trycr=False,
        )
        client = MagicMock()
        mock_build_client.return_value = client
        client.query.return_value = pd.DataFrame(
            [{"month": "202605", "m1_yoy": 5.2, "m2_yoy": 8.1}],
        )

        service = MacroIndicatorsBriefService()
        first = service.get_brief_text()
        second = service.get_brief_text()
        self.assertEqual(first, second)
        self.assertEqual(client.query.call_count, 1)


if __name__ == "__main__":
    unittest.main()
