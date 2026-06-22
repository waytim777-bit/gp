# -*- coding: utf-8 -*-
"""Tests for daily K-line series payload helpers."""

import os
import sys
import unittest

import pandas as pd

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.utils.kline_series import (
    KLINE_SERIES_MAX_BARS,
    build_kline_series_from_dataframe,
    build_kline_series_payload,
)


class TestKlineSeries(unittest.TestCase):
    def test_build_kline_series_payload_from_records(self) -> None:
        records = []
        base_close = 100.0
        for day in range(1, 31):
            close = base_close + day
            records.append(
                {
                    "date": f"2026-01-{day:02d}",
                    "open": close - 0.5,
                    "high": close + 1.0,
                    "low": close - 1.0,
                    "close": close,
                    "volume": 1_000_000 + day * 1000,
                    "pct_chg": 0.5,
                }
            )

        payload = build_kline_series_payload(records, max_bars=10)
        self.assertEqual(payload["source"], "pipeline_daily_bars")
        self.assertEqual(payload["total_records"], 10)
        self.assertEqual(len(payload["rows"]), 10)
        last_row = payload["rows"][-1]
        self.assertEqual(last_row["date"], "2026-01-30")
        self.assertIsNotNone(last_row.get("ma5"))
        self.assertIsNotNone(last_row.get("ma20"))

        snapshot = payload["snapshot"]
        self.assertEqual(snapshot["latest_close"], 130.0)
        self.assertEqual(snapshot["period_high"], 130.0)
        self.assertEqual(snapshot["period_low"], 121.0)
        self.assertIn("distance_from_low_pct", snapshot)
        self.assertIn("distance_from_high_pct", snapshot)

    def test_build_kline_series_from_dataframe_respects_max_bars(self) -> None:
        rows = []
        for day in range(1, KLINE_SERIES_MAX_BARS + 20):
            rows.append(
                {
                    "date": pd.Timestamp("2025-01-01") + pd.Timedelta(days=day - 1),
                    "open": 10.0,
                    "high": 11.0,
                    "low": 9.0,
                    "close": 10.0 + day * 0.01,
                    "volume": 5000,
                }
            )
        df = pd.DataFrame(rows)
        payload = build_kline_series_from_dataframe(df, max_bars=25)
        self.assertEqual(payload["total_records"], 25)
        self.assertEqual(len(payload["rows"]), 25)

    def test_empty_input_returns_empty_dict(self) -> None:
        self.assertEqual(build_kline_series_payload([]), {})
        self.assertEqual(build_kline_series_from_dataframe(pd.DataFrame()), {})


if __name__ == "__main__":
    unittest.main()
