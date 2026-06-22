# -*- coding: utf-8 -*-
"""Normalize daily-bar technical indicator payloads for API and LLM prompts."""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def _round_optional(value: Any, digits: int = 4) -> Optional[float]:
    if value is None:
        return None
    try:
        return round(float(value), digits)
    except (TypeError, ValueError):
        return None


def _as_float_list(values: Any) -> List[float]:
    if not isinstance(values, list):
        return []
    result: List[float] = []
    for item in values:
        rounded = _round_optional(item, 4)
        if rounded is not None:
            result.append(rounded)
    return result


def build_technical_indicators_payload(trend_result: Any) -> Dict[str, Any]:
    """
    Build a stable technical_indicators block from StockTrendAnalyzer output.
    """
    if trend_result is None:
        return {}

    if hasattr(trend_result, "to_dict"):
        try:
            raw = trend_result.to_dict()
        except Exception:
            raw = {}
    elif isinstance(trend_result, dict):
        raw = dict(trend_result)
    else:
        raw = {}

    if not raw:
        return {}

    support_levels = _as_float_list(raw.get("support_levels"))
    resistance_levels = _as_float_list(raw.get("resistance_levels"))

    payload: Dict[str, Any] = {
        "source": "stock_trend_analyzer",
        "as_of_price": _round_optional(raw.get("current_price"), 4),
        "trend": {
            "status": raw.get("trend_status"),
            "ma_alignment": raw.get("ma_alignment"),
            "strength": _round_optional(raw.get("trend_strength"), 2),
        },
        "moving_averages": {
            "ma5": _round_optional(raw.get("ma5"), 4),
            "ma10": _round_optional(raw.get("ma10"), 4),
            "ma20": _round_optional(raw.get("ma20"), 4),
            "ma60": _round_optional(raw.get("ma60"), 4),
            "bias_ma5": _round_optional(raw.get("bias_ma5"), 4),
            "bias_ma10": _round_optional(raw.get("bias_ma10"), 4),
            "bias_ma20": _round_optional(raw.get("bias_ma20"), 4),
        },
        "macd": {
            "dif": _round_optional(raw.get("macd_dif"), 4),
            "dea": _round_optional(raw.get("macd_dea"), 4),
            "bar": _round_optional(raw.get("macd_bar"), 4),
            "status": raw.get("macd_status"),
            "signal": raw.get("macd_signal"),
        },
        "rsi": {
            "rsi_6": _round_optional(raw.get("rsi_6"), 2),
            "rsi_12": _round_optional(raw.get("rsi_12"), 2),
            "rsi_24": _round_optional(raw.get("rsi_24"), 2),
            "status": raw.get("rsi_status"),
            "signal": raw.get("rsi_signal"),
        },
        "kdj": {
            "k": _round_optional(raw.get("kdj_k"), 2),
            "d": _round_optional(raw.get("kdj_d"), 2),
            "j": _round_optional(raw.get("kdj_j"), 2),
            "status": raw.get("kdj_status"),
            "signal": raw.get("kdj_signal"),
        },
        "boll": {
            "upper": _round_optional(raw.get("boll_upper"), 4),
            "middle": _round_optional(raw.get("boll_middle"), 4),
            "lower": _round_optional(raw.get("boll_lower"), 4),
            "pct_b": _round_optional(raw.get("boll_pct_b"), 4),
            "bandwidth_pct": _round_optional(raw.get("boll_bandwidth"), 4),
            "status": raw.get("boll_status"),
            "signal": raw.get("boll_signal"),
        },
        "volume": {
            "status": raw.get("volume_status"),
            "ratio_5d": _round_optional(raw.get("volume_ratio_5d"), 4),
            "trend": raw.get("volume_trend"),
        },
        "levels": {
            "support_levels": support_levels,
            "resistance_levels": resistance_levels,
            "support_ma5": bool(raw.get("support_ma5")),
            "support_ma10": bool(raw.get("support_ma10")),
        },
        "signal": {
            "buy_signal": raw.get("buy_signal"),
            "score": raw.get("signal_score"),
            "reasons": raw.get("signal_reasons") or [],
            "risk_factors": raw.get("risk_factors") or [],
        },
    }

    has_content = any(
        value
        for value in (
            payload.get("as_of_price"),
            payload["trend"].get("status"),
            payload["macd"].get("dif"),
            payload["rsi"].get("rsi_6"),
            payload["kdj"].get("k"),
            payload["boll"].get("upper"),
            support_levels,
            resistance_levels,
        )
    )
    return payload if has_content else {}
