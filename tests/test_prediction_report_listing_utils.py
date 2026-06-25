# -*- coding: utf-8 -*-
"""Tests for prediction report listing version helpers."""

import unittest

from src.services.prediction_report_listing_utils import pick_latest_listing_per_stock


class PredictionReportListingUtilsTestCase(unittest.TestCase):
    def test_pick_latest_listing_per_stock_prefers_highest_cycle_version(self) -> None:
        items = [
            {"id": 1, "code": "600519", "cycle_version": 1, "analyzed_at": "2026-06-23T08:00:00Z"},
            {"id": 2, "code": "600519", "cycle_version": 3, "analyzed_at": "2026-06-23T09:00:00Z"},
            {"id": 3, "code": "600519.SH", "cycle_version": 2, "analyzed_at": "2026-06-23T10:00:00Z"},
            {"id": 4, "code": "000001", "cycle_version": 1, "analyzed_at": "2026-06-23T07:00:00Z"},
        ]

        result = pick_latest_listing_per_stock(items)
        self.assertEqual(len(result), 2)
        by_code = {item["code"]: item for item in result}
        self.assertEqual(by_code["600519"]["id"], 2)
        self.assertEqual(by_code["000001"]["id"], 4)


if __name__ == "__main__":
    unittest.main()
