# -*- coding: utf-8 -*-
"""Tests for Polymarket Gamma parsing and preview."""

import unittest
from unittest.mock import MagicMock, patch

from src.services.polymarket_gamma_service import (
    PolymarketGammaError,
    PolymarketGammaService,
    parse_market_outcomes,
    pick_market,
    summarize_market,
)


class TestParseMarketOutcomes(unittest.TestCase):
    def test_parses_json_strings(self):
        market = {
            "outcomes": '["Yes", "No"]',
            "outcomePrices": '["0.62", "0.38"]',
        }
        rows = parse_market_outcomes(market)
        self.assertEqual(rows[0]["label"], "Yes")
        self.assertEqual(rows[0]["price"], 0.62)
        self.assertEqual(rows[0]["probabilityPct"], 62.0)
        self.assertEqual(rows[1]["label"], "No")

    def test_handles_list_payload(self):
        market = {
            "outcomes": ["Yes", "No"],
            "outcomePrices": [0.7, 0.3],
        }
        rows = parse_market_outcomes(market)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["probabilityPct"], 70.0)


class TestPickMarket(unittest.TestCase):
    def test_prefers_requested_market_slug(self):
        markets = [
            {"slug": "market-a", "volume24hr": 10, "closed": False},
            {"slug": "market-b", "volume24hr": 999, "closed": False},
        ]
        picked = pick_market(markets, market_slug="market-a")
        self.assertEqual(picked["slug"], "market-a")

    def test_falls_back_to_highest_volume(self):
        markets = [
            {"slug": "market-a", "volume24hr": 10, "closed": False},
            {"slug": "market-b", "volume24hr": 999, "closed": False},
        ]
        picked = pick_market(markets)
        self.assertEqual(picked["slug"], "market-b")


class TestPolymarketGammaService(unittest.TestCase):
    def setUp(self):
        PolymarketGammaService._instance = None
        self.service = PolymarketGammaService()

    @patch.object(PolymarketGammaService, "_get_json")
    def test_preview_market_slug(self, mock_get_json):
        mock_get_json.return_value = [
            {
                "slug": "will-fed-cut-rates",
                "question": "Will the Fed cut rates?",
                "outcomes": '["Yes", "No"]',
                "outcomePrices": '["0.55", "0.45"]',
                "volume24hr": 1200,
                "liquidity": 3400,
                "active": True,
                "closed": False,
            }
        ]
        preview = self.service.preview(
            slug_type="market",
            slug="will-fed-cut-rates",
            outcome_label="Yes",
        )
        self.assertEqual(preview["slugType"], "market")
        self.assertEqual(preview["selectedOutcome"]["label"], "Yes")
        self.assertEqual(preview["selectedOutcome"]["probabilityPct"], 55.0)
        mock_get_json.assert_called_once_with("/markets", params={"slug": "will-fed-cut-rates"})

    @patch.object(PolymarketGammaService, "_get_json")
    def test_preview_event_slug(self, mock_get_json):
        mock_get_json.return_value = {
            "title": "Fed Decision",
            "slug": "fed-decision",
            "markets": [
                {
                    "slug": "market-a",
                    "question": "Cut in March?",
                    "outcomes": '["Yes", "No"]',
                    "outcomePrices": '["0.40", "0.60"]',
                    "volume24hr": 100,
                },
                {
                    "slug": "market-b",
                    "question": "Cut in June?",
                    "outcomes": '["Yes", "No"]',
                    "outcomePrices": '["0.70", "0.30"]',
                    "volume24hr": 500,
                },
            ],
        }
        preview = self.service.preview(
            slug_type="event",
            slug="fed-decision",
            outcome_label="Yes",
        )
        self.assertEqual(preview["selectedMarket"]["slug"], "market-b")
        self.assertEqual(preview["selectedOutcome"]["probabilityPct"], 70.0)

    def test_invalid_slug_type(self):
        with self.assertRaises(PolymarketGammaError):
            self.service.preview(slug_type="invalid", slug="foo")


class TestSummarizeMarket(unittest.TestCase):
    def test_summarize_market(self):
        summary = summarize_market(
            {
                "slug": "foo",
                "question": "Bar?",
                "outcomes": '["Yes", "No"]',
                "outcomePrices": '["0.1", "0.9"]',
                "volume24hr": 12.5,
                "liquidityNum": 99.0,
            }
        )
        self.assertEqual(summary["slug"], "foo")
        self.assertEqual(summary["volume24h"], 12.5)
        self.assertEqual(summary["liquidity"], 99.0)


if __name__ == "__main__":
    unittest.main()
