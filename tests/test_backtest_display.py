# -*- coding: utf-8 -*-
"""Tests for backtest display helpers."""

import unittest
from datetime import date, datetime

from src.storage import BacktestResult
from src.utils.backtest_display import (
    backtest_card_label,
    backtest_tone_from_result,
    serialize_backtest_preview,
)


class BacktestDisplayTestCase(unittest.TestCase):
    def _completed_row(self, **overrides):
        base = dict(
            analysis_history_id=1,
            owner_user_id=1,
            code="600519",
            analysis_date=date(2026, 6, 10),
            eval_window_days=10,
            engine_version="v1",
            eval_status="completed",
            evaluated_at=datetime(2026, 6, 20, 12, 0),
            stock_return_pct=3.2,
            direction_correct=True,
            outcome="win",
        )
        base.update(overrides)
        return BacktestResult(**base)

    def test_preview_not_available_when_missing(self) -> None:
        preview = serialize_backtest_preview(None)
        self.assertFalse(preview["available"])
        self.assertEqual(preview["label"], "未回测")
        self.assertEqual(preview["tone"], "neutral")

    def test_preview_success_tone_for_win(self) -> None:
        preview = serialize_backtest_preview(self._completed_row())
        self.assertTrue(preview["available"])
        self.assertEqual(preview["tone"], "success")
        self.assertIn("方向正确", preview["label"])
        self.assertIn("+3.2%", preview["label"])

    def test_preview_danger_tone_for_loss(self) -> None:
        row = self._completed_row(
            outcome="loss",
            direction_correct=False,
            stock_return_pct=-2.5,
        )
        self.assertEqual(backtest_tone_from_result(row), "danger")
        self.assertIn("方向错误", backtest_card_label(row))

    def test_preview_neutral_for_insufficient(self) -> None:
        row = self._completed_row(eval_status="insufficient_data")
        preview = serialize_backtest_preview(row)
        self.assertFalse(preview["available"])
        self.assertEqual(preview["label"], "数据不足")


if __name__ == "__main__":
    unittest.main()
