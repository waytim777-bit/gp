# -*- coding: utf-8 -*-
"""Tests for per-run agent tool cache."""

import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.agent.run_context import agent_run_cache_scope
from src.agent.tools.cache_helpers import run_cached_tool
from src.agent.tools.search_tools import _handle_search_comprehensive_intel


class AgentToolCacheTestCase(unittest.TestCase):
    def test_run_cached_tool_returns_cached_payload(self) -> None:
        calls = {"count": 0}

        def fetcher() -> dict:
            calls["count"] += 1
            return {"value": 1}

        with agent_run_cache_scope({}, stock_code="600519"):
            first = run_cached_tool(cache_key="demo", stock_code="600519", fetcher=fetcher)
            second = run_cached_tool(cache_key="demo", stock_code="600519", fetcher=fetcher)

        self.assertEqual(calls["count"], 1)
        self.assertFalse(first.get("cached"))
        self.assertTrue(second.get("cached"))
        self.assertEqual(second["value"], 1)

    @patch("src.agent.tools.search_tools._get_search_service")
    def test_search_comprehensive_intel_uses_cache(self, mock_get_service) -> None:
        service = MagicMock()
        service.is_available = True
        response = MagicMock()
        response.success = True
        response.query = "q"
        response.results = []
        service.search_comprehensive_intel.return_value = {"latest": response}
        service.format_intel_report.return_value = "report"
        mock_get_service.return_value = service

        with agent_run_cache_scope({"intel_comprehensive": {"report": "cached report"}}, stock_code="601318"):
            payload = _handle_search_comprehensive_intel("601318", "中国平安")

        self.assertTrue(payload.get("cached"))
        self.assertEqual(payload.get("report"), "cached report")
        service.search_comprehensive_intel.assert_not_called()


if __name__ == "__main__":
    unittest.main()
