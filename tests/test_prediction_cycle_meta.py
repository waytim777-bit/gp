# -*- coding: utf-8 -*-
"""Tests for prediction cycle API metadata helpers."""

import unittest
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

from src.services.prediction_cycle_meta import (
    build_prediction_cycle_meta,
    prediction_cycle_meta_for_history_record,
    prediction_cycle_meta_from_mapping,
)


class PredictionCycleMetaTestCase(unittest.TestCase):
    def test_build_prediction_cycle_meta(self) -> None:
        payload = build_prediction_cycle_meta(
            cycle_anchor_date=date(2026, 6, 13),
            prediction_target_date=date(2026, 6, 16),
            from_cache=True,
            probe_credits_charged=2,
        )
        self.assertEqual(payload["cycle_anchor_date"], "2026-06-13")
        self.assertEqual(payload["prediction_target_date"], "2026-06-16")
        self.assertTrue(payload["from_cache"])
        self.assertEqual(payload["probe_credits_charged"], 2)

    def test_prediction_cycle_meta_from_mapping(self) -> None:
        payload = prediction_cycle_meta_from_mapping({
            "cycle_anchor_date": "2026-06-13",
            "prediction_target_date": "2026-06-16",
        })
        assert payload is not None
        self.assertEqual(payload["cycle_anchor_date"], "2026-06-13")

    def test_prediction_cycle_meta_for_history_record(self) -> None:
        db = MagicMock()
        db.get_shared_analysis_run_by_id.return_value = SimpleNamespace(
            analysis_date=date(2026, 6, 13),
            prediction_target_date=date(2026, 6, 16),
            data_as_of_date=date(2026, 6, 13),
        )
        record = SimpleNamespace(shared_run_id=7)
        payload = prediction_cycle_meta_for_history_record(db, record)
        assert payload is not None
        self.assertEqual(payload["cycle_anchor_date"], "2026-06-13")


if __name__ == "__main__":
    unittest.main()
