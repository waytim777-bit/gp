# -*- coding: utf-8 -*-
"""Merge technical support/resistance with chip cost zones."""

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


def _as_level_list(values: Any) -> List[float]:
    if not isinstance(values, list):
        return []
    result: List[float] = []
    for item in values:
        parsed = _safe_float(item)
        if parsed is not None and parsed > 0:
            result.append(round(parsed, 4))
    return result


def _unique_sorted(values: List[float]) -> List[float]:
    return sorted({round(value, 4) for value in values if value > 0})


def build_key_levels_payload(
    trend_result: Any = None,
    *,
    chip_distribution: Optional[Dict[str, Any]] = None,
    technical_indicators: Optional[Dict[str, Any]] = None,
    current_price: Optional[float] = None,
    pattern_hints: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Combine deterministic technical levels and chip cost bands.
    """
    support_levels: List[float] = []
    resistance_levels: List[float] = []

    if trend_result is not None:
        if hasattr(trend_result, "support_levels"):
            support_levels.extend(_as_level_list(getattr(trend_result, "support_levels", [])))
            resistance_levels.extend(_as_level_list(getattr(trend_result, "resistance_levels", [])))
            current_price = current_price or _safe_float(getattr(trend_result, "current_price", None))
        elif isinstance(trend_result, dict):
            support_levels.extend(_as_level_list(trend_result.get("support_levels")))
            resistance_levels.extend(_as_level_list(trend_result.get("resistance_levels")))
            current_price = current_price or _safe_float(trend_result.get("current_price"))

    if isinstance(technical_indicators, dict):
        levels = technical_indicators.get("levels") or {}
        support_levels.extend(_as_level_list(levels.get("support_levels")))
        resistance_levels.extend(_as_level_list(levels.get("resistance_levels")))
        current_price = current_price or _safe_float(technical_indicators.get("as_of_price"))

    chip_block: Dict[str, Any] = {}
    if isinstance(chip_distribution, dict) and chip_distribution:
        avg_cost = _safe_float(chip_distribution.get("avg_cost"))
        cost_90_low = _safe_float(chip_distribution.get("cost_90_low"))
        cost_90_high = _safe_float(chip_distribution.get("cost_90_high"))
        cost_70_low = _safe_float(chip_distribution.get("cost_70_low"))
        cost_70_high = _safe_float(chip_distribution.get("cost_70_high"))
        chip_block = {
            "avg_cost": avg_cost,
            "cost_90_low": cost_90_low,
            "cost_90_high": cost_90_high,
            "cost_70_low": cost_70_low,
            "cost_70_high": cost_70_high,
            "profit_ratio": chip_distribution.get("profit_ratio"),
            "concentration_90": chip_distribution.get("concentration_90"),
        }
        for level in (cost_90_low, cost_70_low, avg_cost):
            if level is not None:
                support_levels.append(level)
        for level in (avg_cost, cost_90_high, cost_70_high):
            if level is not None:
                resistance_levels.append(level)

    price = _safe_float(current_price)
    support_levels = _unique_sorted(support_levels)
    resistance_levels = _unique_sorted(resistance_levels)

    if price is not None:
        support_levels = [level for level in support_levels if level <= price * 1.02]
        resistance_levels = [level for level in resistance_levels if level >= price * 0.98]

    merged_support = support_levels[:5]
    merged_resistance = resistance_levels[:5]

    if not merged_support and not merged_resistance and not chip_block and not pattern_hints:
        return {}

    payload: Dict[str, Any] = {
        "source": "technical_and_chip_merge",
        "current_price": price,
        "technical": {
            "support_levels": merged_support,
            "resistance_levels": merged_resistance,
        },
    }
    if chip_block:
        payload["chip"] = chip_block
    if isinstance(pattern_hints, dict) and pattern_hints:
        payload["patterns"] = pattern_hints
    return payload
