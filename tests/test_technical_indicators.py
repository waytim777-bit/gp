# -*- coding: utf-8 -*-
"""Tests for technical indicator payload helpers."""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.stock_analyzer import TrendAnalysisResult
from src.utils.technical_indicators import build_technical_indicators_payload


class TestTechnicalIndicators(unittest.TestCase):
    def test_build_technical_indicators_payload_from_result(self) -> None:
        result = TrendAnalysisResult(code="300308")
        result.current_price = 120.5
        result.ma5 = 118.0
        result.ma10 = 115.0
        result.ma20 = 110.0
        result.ma60 = 100.0
        result.bias_ma5 = 2.1
        result.macd_dif = 1.2
        result.macd_dea = 0.8
        result.macd_bar = 0.8
        result.macd_signal = "金叉"
        result.rsi_6 = 62.0
        result.rsi_12 = 58.0
        result.rsi_24 = 55.0
        result.support_levels = [115.0, 110.0]
        result.resistance_levels = [125.0]
        result.signal_score = 72

        payload = build_technical_indicators_payload(result)
        self.assertEqual(payload["source"], "stock_trend_analyzer")
        self.assertEqual(payload["as_of_price"], 120.5)
        self.assertEqual(payload["moving_averages"]["ma5"], 118.0)
        self.assertEqual(payload["macd"]["dif"], 1.2)
        self.assertEqual(payload["rsi"]["rsi_6"], 62.0)
        self.assertEqual(payload["levels"]["support_levels"], [115.0, 110.0])
        self.assertEqual(payload["signal"]["score"], 72)


if __name__ == "__main__":
    unittest.main()
