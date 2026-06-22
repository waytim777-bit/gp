# -*- coding: utf-8 -*-
"""Normalize chip distribution payloads for API charts and LLM prompts."""

from __future__ import annotations

from typing import Any, Dict, Optional


def _safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed != parsed:  # NaN
        return None
    return parsed


def build_chip_distribution_payload(
    chip_data: Any,
    *,
    current_price: Optional[float] = None,
    language: str = "zh",
) -> Dict[str, Any]:
    """
    Build a stable chip_distribution block from ChipDistribution or dict.
    """
    if chip_data is None:
        return {}

    if hasattr(chip_data, "profit_ratio"):
        profit_ratio = _safe_float(chip_data.profit_ratio)
        avg_cost = _safe_float(chip_data.avg_cost)
        cost_90_low = _safe_float(chip_data.cost_90_low)
        cost_90_high = _safe_float(chip_data.cost_90_high)
        concentration_90 = _safe_float(chip_data.concentration_90)
        cost_70_low = _safe_float(chip_data.cost_70_low)
        cost_70_high = _safe_float(chip_data.cost_70_high)
        concentration_70 = _safe_float(chip_data.concentration_70)
        source = getattr(chip_data, "source", "pipeline_chip")
        chip_status = None
        if current_price and hasattr(chip_data, "get_chip_status"):
            try:
                chip_status = chip_data.get_chip_status(float(current_price))
            except Exception:
                chip_status = None
    elif isinstance(chip_data, dict):
        profit_ratio = _safe_float(chip_data.get("profit_ratio"))
        avg_cost = _safe_float(chip_data.get("avg_cost"))
        cost_90_low = _safe_float(chip_data.get("cost_90_low"))
        cost_90_high = _safe_float(chip_data.get("cost_90_high"))
        concentration_90 = _safe_float(chip_data.get("concentration_90"))
        cost_70_low = _safe_float(chip_data.get("cost_70_low"))
        cost_70_high = _safe_float(chip_data.get("cost_70_high"))
        concentration_70 = _safe_float(chip_data.get("concentration_70"))
        source = chip_data.get("source") or "pipeline_chip"
        chip_status = chip_data.get("chip_status")
    else:
        return {}

    if profit_ratio is None and avg_cost is None:
        return {}

    payload: Dict[str, Any] = {
        "source": source,
        "profit_ratio": profit_ratio,
        "avg_cost": avg_cost,
        "cost_90_low": cost_90_low,
        "cost_90_high": cost_90_high,
        "concentration_90": concentration_90,
        "cost_70_low": cost_70_low,
        "cost_70_high": cost_70_high,
        "concentration_70": concentration_70,
        "chip_status": chip_status,
    }

    price = _safe_float(current_price)
    if price is not None and avg_cost:
        payload["price_vs_avg_cost_pct"] = round((price - avg_cost) / avg_cost * 100.0, 4)

    # derive chip health label (reuse analyzer helper when available)
    try:
        from src.analyzer import _derive_chip_health

        if profit_ratio is not None and concentration_90 is not None:
            payload["chip_health"] = _derive_chip_health(profit_ratio, concentration_90, language=language)
    except Exception:
        pass

    return {key: value for key, value in payload.items() if value is not None}
