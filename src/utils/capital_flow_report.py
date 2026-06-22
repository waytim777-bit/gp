# -*- coding: utf-8 -*-
"""Normalize capital flow payloads for prediction reports."""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def _non_empty_dict(value: Any) -> Optional[Dict[str, Any]]:
    if isinstance(value, dict) and value:
        return value
    return None


def build_capital_flow_payload(
    fundamental_context: Any,
    *,
    stock_code: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Extract stable capital-flow block from fundamental_context for API / LLM prompts.
    """
    if not isinstance(fundamental_context, dict):
        return {}

    block = fundamental_context.get("capital_flow")
    if not isinstance(block, dict):
        return {}

    status = str(block.get("status") or "not_supported")
    data = block.get("data") if isinstance(block.get("data"), dict) else {}
    stock_flow = data.get("stock_flow") if isinstance(data.get("stock_flow"), dict) else {}
    sector_rankings = data.get("sector_rankings") if isinstance(data.get("sector_rankings"), dict) else {}

    has_stock_flow = any(value is not None for value in stock_flow.values()) if stock_flow else False
    has_sector = bool(sector_rankings.get("top")) or bool(sector_rankings.get("bottom"))
    if status in {"not_supported", "failed"} and not has_stock_flow and not has_sector:
        return {}

    source_chain: List[str] = []
    for item in block.get("source_chain") or data.get("source_chain") or []:
        if isinstance(item, str) and item:
            source_chain.append(item)

    payload: Dict[str, Any] = {
        "source": "fundamental_context",
        "status": status,
        "stock_code": stock_code,
        "stock_flow": {
            "main_net_inflow": stock_flow.get("main_net_inflow"),
            "inflow_5d": stock_flow.get("inflow_5d"),
            "inflow_10d": stock_flow.get("inflow_10d"),
        },
        "sector_rankings": {
            "top": list(sector_rankings.get("top") or [])[:5],
            "bottom": list(sector_rankings.get("bottom") or [])[:5],
        },
    }
    if source_chain:
        payload["source_chain"] = source_chain
    return payload
