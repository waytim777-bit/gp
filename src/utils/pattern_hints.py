# -*- coding: utf-8 -*-
"""Detect simple swing highs/lows from normalized K-line rows."""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def _safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed != parsed:
        return None
    return parsed


def build_pattern_hints_payload(
    kline_series: Any,
    *,
    lookback: int = 30,
    swing_window: int = 2,
) -> Dict[str, Any]:
    """
    Rule-based swing point hints for LLM pattern narration.
    """
    if not isinstance(kline_series, dict):
        return {}

    rows = kline_series.get("rows")
    if not isinstance(rows, list) or len(rows) < swing_window * 2 + 3:
        return {}

    work = rows[-max(lookback, swing_window * 2 + 3):]
    highs: List[Dict[str, Any]] = []
    lows: List[Dict[str, Any]] = []

    for index in range(swing_window, len(work) - swing_window):
        row = work[index]
        if not isinstance(row, dict):
            continue
        high = _safe_float(row.get("high"))
        low = _safe_float(row.get("low"))
        close = _safe_float(row.get("close"))
        date = row.get("date")
        if high is None or low is None or not date:
            continue

        left_highs = [_safe_float(work[index - offset].get("high")) for offset in range(1, swing_window + 1)]
        right_highs = [_safe_float(work[index + offset].get("high")) for offset in range(1, swing_window + 1)]
        left_lows = [_safe_float(work[index - offset].get("low")) for offset in range(1, swing_window + 1)]
        right_lows = [_safe_float(work[index + offset].get("low")) for offset in range(1, swing_window + 1)]

        if all(value is not None and high >= value for value in left_highs + right_highs):
            highs.append({"date": date, "price": high})
        if all(value is not None and low <= value for value in left_lows + right_lows):
            lows.append({"date": date, "price": low})

    if not highs and not lows:
        return {}

    latest_close = _safe_float(work[-1].get("close"))
    pattern_label = "震荡整理"
    if len(highs) >= 2 and len(lows) >= 2:
        recent_highs = [item["price"] for item in highs[-2:]]
        recent_lows = [item["price"] for item in lows[-2:]]
        if recent_highs[-1] > recent_highs[0] and recent_lows[-1] > recent_lows[0]:
            pattern_label = "高低点同步抬升"
        elif recent_highs[-1] < recent_highs[0] and recent_lows[-1] < recent_lows[0]:
            pattern_label = "高低点同步下移"
        elif recent_highs[-1] <= recent_highs[0] and recent_lows[-1] >= recent_lows[0]:
            pattern_label = "收敛震荡"
    elif latest_close is not None and lows:
        if latest_close <= lows[-1]["price"] * 1.02:
            pattern_label = "贴近阶段低点"
    elif latest_close is not None and highs:
        if latest_close >= highs[-1]["price"] * 0.98:
            pattern_label = "贴近阶段高点"

    return {
        "source": "kline_swing_rules",
        "lookback_bars": len(work),
        "pattern_label": pattern_label,
        "swing_highs": highs[-3:],
        "swing_lows": lows[-3:],
    }
