# -*- coding: utf-8 -*-
"""Tests for prediction cycle resolution."""

import os
import unittest
from datetime import date, datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

from src.core.prediction_cycle import (
    get_prediction_cutoff_hour,
    resolve_prediction_cycle,
)


class PredictionCycleTestCase(unittest.TestCase):
    def test_cutoff_hour_default(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("PREDICTION_CYCLE_CUTOFF_HOUR", None)
            self.assertEqual(get_prediction_cutoff_hour(), 18)

    def test_cutoff_hour_invalid_falls_back(self) -> None:
        with patch.dict(os.environ, {"PREDICTION_CYCLE_CUTOFF_HOUR": "bad"}):
            self.assertEqual(get_prediction_cutoff_hour(), 18)

    @patch("src.core.prediction_cycle.get_effective_trading_date")
    @patch("src.core.prediction_cycle.add_trading_days")
    @patch("src.core.prediction_cycle.previous_trading_day")
    def test_resolve_uses_previous_anchor_before_cutoff(
        self,
        mock_previous,
        mock_add_days,
        mock_effective,
    ) -> None:
        anchor = date(2026, 6, 13)  # Friday
        previous = date(2026, 6, 12)
        mock_effective.return_value = anchor
        mock_previous.return_value = previous
        mock_add_days.return_value = date(2026, 6, 16)

        tz = ZoneInfo("Asia/Shanghai")
        now = datetime(2026, 6, 16, 10, 0, tzinfo=tz)  # Monday morning

        cycle = resolve_prediction_cycle("cn", current_time=now, data_as_of_date=anchor)

        mock_previous.assert_called_once()
        self.assertEqual(cycle.cycle_anchor_date, previous)
        self.assertEqual(cycle.prediction_target_date, date(2026, 6, 16))

    @patch("src.core.prediction_cycle.get_effective_trading_date")
    @patch("src.core.prediction_cycle.add_trading_days")
    @patch("src.core.prediction_cycle.previous_trading_day")
    def test_resolve_keeps_anchor_after_cutoff(
        self,
        mock_previous,
        mock_add_days,
        mock_effective,
    ) -> None:
        anchor = date(2026, 6, 16)  # Monday
        mock_effective.return_value = anchor
        mock_add_days.return_value = date(2026, 6, 17)

        tz = ZoneInfo("Asia/Shanghai")
        now = datetime(2026, 6, 16, 19, 0, tzinfo=tz)

        cycle = resolve_prediction_cycle("cn", current_time=now, data_as_of_date=anchor)

        mock_previous.assert_not_called()
        self.assertEqual(cycle.cycle_anchor_date, anchor)


if __name__ == "__main__":
    unittest.main()
