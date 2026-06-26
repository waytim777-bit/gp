# -*- coding: utf-8 -*-
"""Tests for Polymarket admin watchlist service."""

import unittest
from unittest.mock import MagicMock, patch

from src.services.polymarket_admin_service import PolymarketAdminService
from src.storage import PolymarketWatchItem


class TestPolymarketAdminService(unittest.TestCase):
    def setUp(self):
        PolymarketAdminService._instance = None
        self.service = PolymarketAdminService()
        self.service._db = MagicMock()
        self.service._gamma = MagicMock()

    def test_serialize_watch_item(self):
        row = PolymarketWatchItem(
            id=1,
            slug_type="event",
            slug="fed-decision",
            label="Fed",
            category="macro",
            enabled=True,
            priority=10,
            market_slug="market-a",
            outcome_label="Yes",
        )
        payload = self.service._serialize_watch_item(row)
        self.assertEqual(payload["slugType"], "event")
        self.assertEqual(payload["marketSlug"], "market-a")
        self.assertEqual(payload["outcomeLabel"], "Yes")

    def test_create_watch_item(self):
        row = PolymarketWatchItem(
            id=2,
            slug_type="market",
            slug="foo-market",
            label="Foo",
            category="macro",
            enabled=True,
            priority=100,
            outcome_label="Yes",
        )
        self.service._db.create_polymarket_watch_item.return_value = row
        payload = self.service.create_watch_item(
            {
                "slugType": "market",
                "slug": "foo-market",
                "label": "Foo",
            }
        )
        self.assertEqual(payload["id"], 2)
        self.service._db.create_polymarket_watch_item.assert_called_once()

    def test_preview_watch_item(self):
        row = PolymarketWatchItem(
            id=3,
            slug_type="event",
            slug="fed-decision",
            label="Fed",
            category="macro",
            enabled=True,
            priority=100,
            market_slug=None,
            outcome_label="Yes",
        )
        self.service._db.get_polymarket_watch_item.return_value = row
        self.service._gamma.preview.return_value = {
            "slugType": "event",
            "slug": "fed-decision",
            "title": "Fed",
            "question": "Cut?",
            "markets": [],
            "selectedMarket": None,
            "selectedOutcome": {"label": "Yes", "price": 0.5, "probabilityPct": 50.0},
            "fetchedAt": "2026-06-23T10:00:00",
        }
        preview = self.service.preview_watch_item(3)
        self.assertEqual(preview["watchItem"]["id"], 3)
        self.service._gamma.preview.assert_called_once_with(
            slug_type="event",
            slug="fed-decision",
            market_slug=None,
            outcome_label="Yes",
        )

    def test_delete_missing_item_raises(self):
        self.service._db.delete_polymarket_watch_item.return_value = False
        with self.assertRaises(KeyError):
            self.service.delete_watch_item(99)


if __name__ == "__main__":
    unittest.main()
