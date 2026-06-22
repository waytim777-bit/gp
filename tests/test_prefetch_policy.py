# -*- coding: utf-8 -*-
"""Tests for prefetch-aware agent tool withholding."""

import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.agent.agents.technical_agent import TechnicalAgent
from src.agent.prefetch_policy import (
    filter_tool_names,
    prefetch_satisfied_for_tool,
    seed_tool_cache_from_context,
    withheld_fetch_tools,
)
from src.core.pipeline import StockAnalysisPipeline


class PrefetchPolicyTestCase(unittest.TestCase):
    def test_withheld_fetch_tools_when_prefetch_present(self) -> None:
        data = {
            "realtime_quote": {"price": 10.0},
            "kline_series": {"rows": [{"close": 10.0}]},
            "intel_comprehensive": {"report": "news"},
            "capital_flow": {"main_net_inflow": 1.0},
            "trend_result": {"ma5": 10.0, "current_price": 10.0},
            "fundamental_context": {"valuation": {"status": "ok", "data": {"pe_ratio": 12.0}}},
        }
        seed_tool_cache_from_context(data)
        withheld = withheld_fetch_tools(data)
        self.assertIn("get_realtime_quote", withheld)
        self.assertIn("get_daily_history", withheld)
        self.assertIn("search_comprehensive_intel", withheld)
        self.assertIn("search_stock_news", withheld)
        self.assertIn("get_capital_flow", withheld)
        self.assertIn("analyze_trend", withheld)
        self.assertIn("calculate_ma", withheld)
        self.assertIn("get_volume_analysis", withheld)
        self.assertIn("analyze_pattern", withheld)
        self.assertIn("get_stock_info", withheld)

    def test_filter_tool_names_withholds_analysis_when_trend_prefetched(self) -> None:
        names = [
            "get_realtime_quote",
            "get_volume_analysis",
            "calculate_ma",
        ]
        data = {
            "realtime_quote": {"price": 1.0},
            "daily_history": {"data": [{"close": 1.0}]},
            "trend_result": {"current_price": 1.0},
        }
        filtered = filter_tool_names(names, data)
        self.assertEqual(filtered, [])

    def test_technical_agent_tool_names_withheld_when_prefetched(self) -> None:
        data = {
            "realtime_quote": {"price": 52.0},
            "daily_history": {"data": [{"close": 52.0}]},
            "chip_distribution": {"profit_ratio": 0.5},
            "trend_result": {"ma5": 53.0, "current_price": 52.0},
        }
        filtered = filter_tool_names(TechnicalAgent.tool_names, data)
        self.assertNotIn("get_realtime_quote", filtered)
        self.assertNotIn("get_daily_history", filtered)
        self.assertNotIn("get_chip_distribution", filtered)
        self.assertNotIn("analyze_trend", filtered)
        self.assertNotIn("calculate_ma", filtered)
        self.assertNotIn("get_volume_analysis", filtered)
        self.assertNotIn("analyze_pattern", filtered)

    def test_realtime_from_trend_when_quote_disabled(self) -> None:
        data = {
            "trend_result": {"current_price": 26.66},
            "kline_series": {"rows": [{"close": 26.66}]},
            "daily_history": {"data": [{"close": 26.66}]},
        }
        seed_tool_cache_from_context(data)
        self.assertTrue(prefetch_satisfied_for_tool("get_realtime_quote", data))
        self.assertIn("get_realtime_quote", withheld_fetch_tools(data))

    def test_capital_flow_from_fundamental_context(self) -> None:
        data = {
            "fundamental_context": {
                "capital_flow": {
                    "status": "ok",
                    "data": {"stock_flow": {"main_net_inflow": 100.0}},
                }
            }
        }
        seed_tool_cache_from_context(data)
        self.assertTrue(prefetch_satisfied_for_tool("get_capital_flow", data))

    def test_capital_flow_failed_status_withholds_tool(self) -> None:
        data = {
            "stock_code": "600731",
            "capital_flow": {"stock_code": "600731", "status": "failed", "errors": ["timeout"]},
        }
        seed_tool_cache_from_context(data)
        self.assertTrue(prefetch_satisfied_for_tool("get_capital_flow", data))
        self.assertIn("get_capital_flow", withheld_fetch_tools(data))

    def test_capital_flow_not_supported_withholds_tool(self) -> None:
        data = {
            "stock_code": "AAPL",
            "capital_flow": {"stock_code": "AAPL", "status": "not_supported"},
        }
        self.assertTrue(prefetch_satisfied_for_tool("get_capital_flow", data))


class PipelineCapitalFlowPrefetchTestCase(unittest.TestCase):
    def test_ensure_fetches_when_fundamental_failed(self) -> None:
        pipeline = StockAnalysisPipeline.__new__(StockAnalysisPipeline)
        pipeline.config = SimpleNamespace(fundamental_fetch_timeout_seconds=2.0)
        pipeline.fetcher_manager = MagicMock()
        pipeline.fetcher_manager.get_capital_flow_context.return_value = {
            "status": "ok",
            "data": {"stock_flow": {"main_net_inflow": 1000.0}, "sector_rankings": {}},
            "errors": [],
        }
        fc = {"capital_flow": {"status": "failed", "data": {}, "errors": ["timeout"]}}
        result = pipeline._ensure_capital_flow_for_agent("600731", "湖南海利", fc)
        pipeline.fetcher_manager.get_capital_flow_context.assert_called_once()
        self.assertEqual(result["main_net_inflow"], 1000.0)
        self.assertEqual(fc["capital_flow"]["status"], "ok")

    def test_ensure_skips_fetch_when_usable(self) -> None:
        pipeline = StockAnalysisPipeline.__new__(StockAnalysisPipeline)
        pipeline.config = SimpleNamespace(fundamental_fetch_timeout_seconds=2.0)
        pipeline.fetcher_manager = MagicMock()
        fc = {
            "capital_flow": {
                "status": "ok",
                "data": {"stock_flow": {"main_net_inflow": 500.0}, "sector_rankings": {}},
                "errors": [],
            }
        }
        result = pipeline._ensure_capital_flow_for_agent("600731", "湖南海利", fc)
        pipeline.fetcher_manager.get_capital_flow_context.assert_not_called()
        self.assertEqual(result["main_net_inflow"], 500.0)

    def test_ensure_skips_fetch_for_not_supported(self) -> None:
        pipeline = StockAnalysisPipeline.__new__(StockAnalysisPipeline)
        pipeline.config = SimpleNamespace(fundamental_fetch_timeout_seconds=2.0)
        pipeline.fetcher_manager = MagicMock()
        fc = {"capital_flow": {"status": "not_supported", "data": {}, "errors": []}}
        result = pipeline._ensure_capital_flow_for_agent("AAPL", "Apple", fc)
        pipeline.fetcher_manager.get_capital_flow_context.assert_not_called()
        self.assertEqual(result["status"], "not_supported")


if __name__ == "__main__":
    unittest.main()
