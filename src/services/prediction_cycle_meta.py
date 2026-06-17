# -*- coding: utf-8 -*-
"""Helpers for exposing prediction cycle metadata in API responses."""

from __future__ import annotations

from datetime import date
from typing import Any, Dict, Optional


def _iso(value: Optional[date]) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat()


def build_prediction_cycle_meta(
    *,
    cycle_anchor_date: Optional[date | str] = None,
    prediction_target_date: Optional[date | str] = None,
    data_as_of_date: Optional[date | str] = None,
    from_cache: Optional[bool] = None,
    probe_credits_charged: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    """Build API-friendly prediction cycle metadata."""
    anchor = cycle_anchor_date.isoformat() if isinstance(cycle_anchor_date, date) else cycle_anchor_date
    target = (
        prediction_target_date.isoformat()
        if isinstance(prediction_target_date, date)
        else prediction_target_date
    )
    data_as_of = (
        data_as_of_date.isoformat()
        if isinstance(data_as_of_date, date)
        else data_as_of_date
    )

    if not any([anchor, target, data_as_of]):
        return None

    payload: Dict[str, Any] = {}
    if anchor:
        payload["cycle_anchor_date"] = anchor
    if target:
        payload["prediction_target_date"] = target
    if data_as_of:
        payload["data_as_of_date"] = data_as_of
    if from_cache is not None:
        payload["from_cache"] = bool(from_cache)
    if probe_credits_charged is not None and int(probe_credits_charged) > 0:
        payload["probe_credits_charged"] = int(probe_credits_charged)
    return payload


def prediction_cycle_meta_from_mapping(raw: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    return build_prediction_cycle_meta(
        cycle_anchor_date=raw.get("cycle_anchor_date"),
        prediction_target_date=raw.get("prediction_target_date"),
        data_as_of_date=raw.get("data_as_of_date"),
        from_cache=raw.get("from_cache"),
        probe_credits_charged=raw.get("probe_credits_charged"),
    )


def prediction_cycle_meta_from_shared_run(shared_run: Any) -> Optional[Dict[str, Any]]:
    if shared_run is None:
        return None
    return build_prediction_cycle_meta(
        cycle_anchor_date=getattr(shared_run, "analysis_date", None),
        prediction_target_date=getattr(shared_run, "prediction_target_date", None),
        data_as_of_date=getattr(shared_run, "data_as_of_date", None),
    )


def prediction_cycle_meta_for_history_record(db: Any, record: Any) -> Optional[Dict[str, Any]]:
    shared_run_id = getattr(record, "shared_run_id", None)
    if not shared_run_id:
        return None
    shared_run = db.get_shared_analysis_run_by_id(int(shared_run_id))
    return prediction_cycle_meta_from_shared_run(shared_run)
