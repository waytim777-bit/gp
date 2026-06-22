# -*- coding: utf-8 -*-
"""Tests for chip/key-level/pattern helper payloads."""

import os
import sys
import unittest

import pandas as pd

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from data_provider.realtime_types import ChipDistribution
from src.stock_analyzer import StockTrendAnalyzer, TrendAnalysisResult
from src.utils.chip_distribution import build_chip_distribution_payload
from src.utils.key_levels import build_key_levels_payload
from src.utils.kline_series import build_kline_series_payload
from src.utils.pattern_hints import build_pattern_hints_payload
from src.utils.technical_indicators import build_technical_indicators_payload


class TestPhase3TechnicalHelpers(unittest.TestCase):
    def _sample_df(self, bars: int = 40) -> pd.DataFrame:
        rows = []
        start = pd.Timestamp("2025-10-01")
        for day in range(bars):
            close = 100 + day * 0.5
            rows.append(
                {
                    "date": (start + pd.Timedelta(days=day)).date().isoformat(),
                    "open": close - 0.3,
                    "high": close + 0.6,
                    "low": close - 0.6,
                    "close": close,
                    "volume": 1_000_000 + day * 1000,
                }
            )
        return pd.DataFrame(rows)

    def test_stock_analyzer_includes_kdj_and_boll(self) -> None:
        analyzer = StockTrendAnalyzer()
        result = analyzer.analyze(self._sample_df(), "300308")
        self.assertGreater(result.kdj_k, 0)
        self.assertGreater(result.boll_upper, result.boll_middle)
        self.assertGreater(result.boll_middle, result.boll_lower)

        payload = build_technical_indicators_payload(result)
        self.assertIsNotNone(payload["kdj"]["k"])
        self.assertIsNotNone(payload["boll"]["upper"])

    def test_build_chip_distribution_payload(self) -> None:
        chip = ChipDistribution(
            code="300308",
            profit_ratio=0.62,
            avg_cost=118.5,
            cost_90_low=110.0,
            cost_90_high=125.0,
            concentration_90=0.12,
        )
        payload = build_chip_distribution_payload(chip, current_price=120.0)
        self.assertEqual(payload["avg_cost"], 118.5)
        self.assertIn("chip_health", payload)
        self.assertIn("price_vs_avg_cost_pct", payload)

    def test_build_key_levels_and_pattern_hints(self) -> None:
        trend = TrendAnalysisResult(code="300308")
        trend.current_price = 120.0
        trend.support_levels = [115.0, 110.0]
        trend.resistance_levels = [125.0]

        chip_payload = {
            "avg_cost": 118.0,
            "cost_90_low": 112.0,
            "cost_90_high": 124.0,
        }
        kline_payload = build_kline_series_payload(self._sample_df())
        pattern_hints = build_pattern_hints_payload(kline_payload)
        key_levels = build_key_levels_payload(
            trend,
            chip_distribution=chip_payload,
            technical_indicators=build_technical_indicators_payload(trend),
            pattern_hints=pattern_hints,
        )

        self.assertIn(115.0, key_levels["technical"]["support_levels"])
        self.assertEqual(key_levels["chip"]["avg_cost"], 118.0)
        self.assertIsInstance(pattern_hints, dict)


if __name__ == "__main__":
    unittest.main()
