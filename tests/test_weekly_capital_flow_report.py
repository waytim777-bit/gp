# -*- coding: utf-8 -*-
"""Tests for weekly K-line and capital flow report helpers."""

import os
import sys
import unittest

import pandas as pd

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.utils.capital_flow_report import build_capital_flow_payload
from src.utils.kline_series import build_weekly_kline_series_payload


class TestWeeklyAndCapitalFlowHelpers(unittest.TestCase):
    def test_build_weekly_kline_series_payload(self) -> None:
        rows = []
        start = pd.Timestamp("2025-01-01")
        for day in range(120):
            close = 100 + day * 0.2
            rows.append(
                {
                    "date": (start + pd.Timedelta(days=day)).date().isoformat(),
                    "open": close - 0.2,
                    "high": close + 0.4,
                    "low": close - 0.4,
                    "close": close,
                    "volume": 10000 + day,
                }
            )
        payload = build_weekly_kline_series_payload(rows, max_bars=20)
        self.assertEqual(payload.get("timeframe"), "weekly")
        self.assertGreaterEqual(payload.get("total_records", 0), 10)
        self.assertTrue(payload.get("rows"))

    def test_build_capital_flow_payload(self) -> None:
        fundamental_context = {
            "capital_flow": {
                "status": "partial",
                "data": {
                    "stock_flow": {
                        "main_net_inflow": 123456789.0,
                        "inflow_5d": 456789.0,
                        "inflow_10d": -12345.0,
                    },
                    "sector_rankings": {
                        "top": [{"name": "半导体", "net_inflow": 1000.0}],
                        "bottom": [{"name": "银行", "net_inflow": -800.0}],
                    },
                },
            }
        }
        payload = build_capital_flow_payload(fundamental_context, stock_code="600519")
        self.assertEqual(payload["stock_code"], "600519")
        self.assertEqual(payload["stock_flow"]["main_net_inflow"], 123456789.0)
        self.assertEqual(len(payload["sector_rankings"]["top"]), 1)


if __name__ == "__main__":
    unittest.main()
