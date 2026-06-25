# -*- coding: utf-8 -*-
"""Tests for external intelligence search dimensions."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from src.search_intel import (
    COMPREHENSIVE_INTEL_DEFAULT_MAX_SEARCHES,
    build_external_intel_dimensions,
    resolve_intel_industry_label,
)
from src.search_service import SearchService


class ResolveIntelIndustryLabelTestCase(unittest.TestCase):
    def test_prefers_company_profile_industry(self):
        label = resolve_intel_industry_label(
            stock_code="603407",
            stock_name="长裕集团",
            fundamental_context={
                "company_profile": {
                    "data": {"industry": "包装印刷"},
                },
                "belong_boards": [{"name": "轻工制造行业", "board_type": "行业"}],
            },
        )
        self.assertEqual(label, "包装印刷")

    def test_falls_back_to_belong_boards(self):
        label = resolve_intel_industry_label(
            stock_code="600519",
            stock_name="贵州茅台",
            fundamental_context={
                "belong_boards": [{"name": "白酒行业", "board_type": "行业"}],
            },
        )
        self.assertEqual(label, "白酒")

    def test_returns_none_when_no_signal(self):
        label = resolve_intel_industry_label(
            stock_code="600519",
            stock_name="贵州茅台",
            fundamental_context={},
        )
        self.assertIsNone(label)


class ExternalIntelDimensionsTestCase(unittest.TestCase):
    def test_cn_dimensions_include_policy_and_international(self):
        dims = build_external_intel_dimensions(
            stock_code="603407",
            stock_name="长裕集团",
            industry="包装印刷",
            is_foreign=False,
        )
        names = [dim["name"] for dim in dims]
        self.assertEqual(names, ["industry_news", "intl_news", "cn_policy"])
        self.assertIn("包装印刷", dims[2]["query"])
        self.assertIn("政策", dims[2]["query"])


class SearchComprehensiveIntelExternalTestCase(unittest.TestCase):
    def test_includes_external_dimensions_by_default(self):
        service = SearchService(searxng_public_instances_enabled=False)
        captured_dims = []

        def fake_search(query, max_results=5, days=None, topic=None):
            captured_dims.append(query)
            response = MagicMock()
            response.success = True
            response.results = []
            response.query = query
            response.provider = "Mock"
            return response

        mock_provider = MagicMock()
        mock_provider.is_available = True
        mock_provider.name = "Mock"
        mock_provider.search = fake_search
        service._providers = [mock_provider]

        with patch("src.search_service.SearchService._effective_news_window_days", return_value=3), patch(
            "src.search_service.SearchService._provider_request_size",
            return_value=3,
        ), patch("time.sleep"):
            intel = service.search_comprehensive_intel(
                "603407",
                "长裕集团",
                max_searches=COMPREHENSIVE_INTEL_DEFAULT_MAX_SEARCHES,
                industry="包装印刷",
            )

        self.assertIn("industry_news", intel)
        self.assertIn("intl_news", intel)
        self.assertIn("cn_policy", intel)
        self.assertGreaterEqual(len(captured_dims), 9)

    def test_can_disable_external_dimensions(self):
        service = SearchService(searxng_public_instances_enabled=False)

        def fake_search(query, max_results=5, days=None, topic=None):
            response = MagicMock()
            response.success = True
            response.results = []
            response.query = query
            response.provider = "Mock"
            return response

        mock_provider = MagicMock()
        mock_provider.is_available = True
        mock_provider.name = "Mock"
        mock_provider.search = fake_search
        service._providers = [mock_provider]

        with patch("src.search_service.SearchService._effective_news_window_days", return_value=3), patch(
            "src.search_service.SearchService._provider_request_size",
            return_value=3,
        ), patch("time.sleep"):
            intel = service.search_comprehensive_intel(
                "603407",
                "长裕集团",
                max_searches=6,
                include_external_intel=False,
            )

        self.assertNotIn("industry_news", intel)
        self.assertNotIn("intl_news", intel)
        self.assertNotIn("cn_policy", intel)


if __name__ == "__main__":
    unittest.main()
