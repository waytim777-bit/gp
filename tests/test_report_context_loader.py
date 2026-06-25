# -*- coding: utf-8 -*-
"""Tests for follow-up chat report context hydration."""

import unittest
from unittest.mock import patch

from src.agent.prefetch_policy import withheld_fetch_tools
from src.agent.report_context_loader import (
    hydrate_context_from_record,
    report_context_to_agent_prefetch,
)


class TestReportContextLoader(unittest.TestCase):
    def test_report_context_to_agent_prefetch_maps_snapshot_fields(self):
        bundle = {
            "record_id": 26,
            "stock_code": "603407",
            "daily_history": {
                "code": "603407",
                "total_records": 2,
                "data": [
                    {"date": "2026-06-17", "close": 68.0},
                    {"date": "2026-06-18", "close": 68.5},
                ],
                "source": "db",
            },
            "realtime_quote": {"code": "603407", "price": 68.04},
            "chip_distribution": {"profit_ratio": 55.0},
            "news_content": "sample news",
            "context_snapshot": {
                "enhanced_context": {
                    "trend_analysis": {"current_price": 68.04, "ma5": 60.0},
                    "technical_indicators": {"rsi_6": 64.1},
                    "fundamental_context": {"coverage": {"valuation": True}},
                }
            },
        }

        prefetch = report_context_to_agent_prefetch(bundle)

        self.assertTrue(prefetch["_report_context_hydrated"])
        self.assertEqual(prefetch["stock_code"], "603407")
        self.assertEqual(prefetch["daily_history"]["source"], "db")
        self.assertEqual(prefetch["kline_series"]["total_records"], 2)
        self.assertEqual(prefetch["realtime_quote"]["price"], 68.04)
        self.assertEqual(prefetch["chip_distribution"]["profit_ratio"], 55.0)
        self.assertEqual(prefetch["news_context"], "sample news")
        self.assertEqual(prefetch["intel_comprehensive"]["report"], "sample news")
        self.assertEqual(prefetch["intel_comprehensive"]["source"], "analysis_history")
        self.assertEqual(prefetch["trend_result"]["current_price"], 68.04)
        self.assertEqual(prefetch["technical_indicators"]["rsi_6"], 64.1)

    def test_hydrate_context_from_record_merges_db_bundle(self):
        bundle = {
            "record_id": 26,
            "stock_code": "603407",
            "daily_history": {
                "code": "603407",
                "total_records": 1,
                "data": [{"date": "2026-06-18", "close": 68.5}],
                "source": "db",
            },
            "realtime_quote": {"code": "603407", "price": 68.04},
            "news_content": "cached intel report",
            "intel_comprehensive": {
                "report": "cached intel report",
                "source": "analysis_history",
                "reused": True,
            },
            "context_snapshot": {
                "enhanced_context": {
                    "trend_analysis": {"current_price": 68.04},
                    "technical_indicators": {"rsi_6": 64.1},
                }
            },
        }

        with patch(
            "src.agent.report_context_loader.load_report_context_by_id",
            return_value=bundle,
        ):
            merged = hydrate_context_from_record(
                {"stock_code": "603407", "record_id": 26, "stock_name": "长裕集团"},
            )

        self.assertTrue(merged["_report_context_hydrated"])
        self.assertEqual(merged["stock_name"], "长裕集团")
        self.assertEqual(merged["daily_history"]["source"], "db")
        withheld = withheld_fetch_tools(merged)
        self.assertIn("get_daily_history", withheld)
        self.assertIn("get_realtime_quote", withheld)
        self.assertIn("analyze_trend", withheld)
        self.assertIn("get_report_context", withheld)
        self.assertIn("search_comprehensive_intel", withheld)
        self.assertIn("search_stock_news", withheld)

    def test_resolve_news_content_prefers_history_column(self):
        from types import SimpleNamespace

        from src.agent.report_context_loader import _resolve_news_content

        row = SimpleNamespace(news_content="column news body")
        snapshot = {"news_content": "snapshot news body"}
        self.assertEqual(_resolve_news_content(row, snapshot), "column news body")

    def test_hydrate_skips_reload_when_prefetch_already_present(self):
        existing = {
            "record_id": 26,
            "daily_history": {"data": [{"close": 1.0}]},
            "realtime_quote": {"price": 1.0},
            "_report_context_hydrated": True,
        }

        with patch(
            "src.agent.report_context_loader.load_report_context_by_id",
        ) as load_mock:
            merged = hydrate_context_from_record(existing)

        load_mock.assert_not_called()
        self.assertTrue(merged["_report_context_hydrated"])
        self.assertEqual(merged["daily_history"], existing["daily_history"])


if __name__ == "__main__":
    unittest.main()
