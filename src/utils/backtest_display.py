# -*- coding: utf-8 -*-
"""Helpers to serialize backtest rows for marketplace cards and report sections."""

from __future__ import annotations

from typing import Any, Dict, Optional

from src.storage import BacktestResult, DatabaseManager


def resolve_canonical_analysis_history_id(
    db: DatabaseManager,
    history_id: int,
) -> int:
    """Map a viewer history row (incl. buyer clone) to canonical analysis_history id."""
    record = db.get_analysis_history_by_id(int(history_id), scoped=False)
    if record is None:
        return int(history_id)

    shared_run_id = getattr(record, "shared_run_id", None)
    if not shared_run_id:
        return int(record.id)

    shared_run = db.get_shared_analysis_run_by_id(int(shared_run_id))
    if shared_run is not None and shared_run.analysis_history_id:
        return int(shared_run.analysis_history_id)
    return int(record.id)


def backtest_tone_from_result(row: Optional[BacktestResult]) -> str:
    """UI tone token: success (green), danger (red), neutral (grey)."""
    if row is None or row.eval_status != "completed":
        return "neutral"
    outcome = (row.outcome or "").lower()
    if outcome == "win":
        return "success"
    if outcome == "loss":
        return "danger"
    if row.direction_correct is True:
        return "success"
    if row.direction_correct is False:
        return "danger"
    return "neutral"


def backtest_card_label(row: Optional[BacktestResult]) -> str:
    if row is None:
        return "未回测"
    if row.eval_status != "completed":
        if row.eval_status in {"insufficient_data", "insufficient"}:
            return "数据不足"
        if row.eval_status == "error":
            return "回测异常"
        return "待回测"

    parts = []
    if row.direction_correct is True:
        parts.append("方向正确")
    elif row.direction_correct is False:
        parts.append("方向错误")

    if row.stock_return_pct is not None:
        try:
            pct_val = float(row.stock_return_pct)
            sign = "+" if pct_val > 0 else ""
            parts.append(f"{sign}{pct_val:.1f}%")
        except (TypeError, ValueError):
            pass

    if parts:
        window = row.eval_window_days
        if window:
            return f"{' · '.join(parts)}（{int(window)}日）"
        return " · ".join(parts)

    outcome_labels = {
        "win": "验证通过",
        "loss": "验证未通过",
        "neutral": "中性",
    }
    return outcome_labels.get((row.outcome or "").lower(), "已回测")


def serialize_backtest_preview(row: Optional[BacktestResult]) -> Dict[str, Any]:
    """Compact backtest block for prediction report listing cards."""
    if row is None:
        return {
            "available": False,
            "tone": "neutral",
            "label": "未回测",
        }
    if row.eval_status != "completed":
        return {
            "available": False,
            "tone": "neutral",
            "label": backtest_card_label(row),
            "eval_status": row.eval_status,
        }
    return {
        "available": True,
        "tone": backtest_tone_from_result(row),
        "label": backtest_card_label(row),
        "outcome": row.outcome,
        "direction_correct": row.direction_correct,
        "stock_return_pct": row.stock_return_pct,
        "eval_window_days": row.eval_window_days,
        "eval_status": row.eval_status,
    }
