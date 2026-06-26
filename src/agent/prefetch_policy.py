# -*- coding: utf-8 -*-
"""Prefetch-aware tool policy for agent runs.

Market data, K-line, news/intel, and capital-flow are fetched once by the
pipeline before agents start. When that data is already present in the run
context, fetch/search tools are withheld from the LLM so it analyzes the
injected payload directly instead of spending another billed LLM round-trip.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, Iterable, List, Optional, Set

from src.agent.run_context import cache_get_tool_result, cache_store_tool_result
from src.agent.tools.registry import ToolRegistry

logger = logging.getLogger(__name__)

PrefetchPredicate = Callable[[Dict[str, Any]], bool]


def _is_present(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, set, dict)):
        return len(value) > 0
    return True


def _has_kline(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    rows = value.get("rows") or value.get("data")
    return isinstance(rows, list) and len(rows) > 0


def _has_daily_history(data: Dict[str, Any]) -> bool:
    if _is_present(data.get("daily_history")):
        return True
    return _has_kline(data.get("kline_series"))


def _has_intel(data: Dict[str, Any]) -> bool:
    if _is_present(data.get("intel_comprehensive")):
        return True
    return _is_present(data.get("news_context"))


def _has_realtime(data: Dict[str, Any]) -> bool:
    if _is_present(data.get("realtime_quote")):
        return True
    enhanced = data.get("enhanced_context")
    if isinstance(enhanced, dict):
        rt = enhanced.get("realtime")
        if isinstance(rt, dict) and rt.get("price") is not None:
            return True
    trend = data.get("trend_result")
    if isinstance(trend, dict) and trend.get("current_price") is not None:
        return True
    return False


def _has_chip(data: Dict[str, Any]) -> bool:
    return _is_present(data.get("chip_distribution"))


def _has_capital_flow(data: Dict[str, Any]) -> bool:
    cf = data.get("capital_flow")
    if isinstance(cf, dict):
        if cf.get("status"):
            return True
        if _is_present(cf):
            return True
    fc = data.get("fundamental_context")
    if not isinstance(fc, dict):
        return False
    block = fc.get("capital_flow")
    if not isinstance(block, dict):
        return False
    status = block.get("status")
    if status in ("ok", "partial", "failed", "not_supported"):
        return True
    block_data = block.get("data") or {}
    stock_flow = block_data.get("stock_flow") if isinstance(block_data, dict) else {}
    if isinstance(stock_flow, dict) and stock_flow:
        return True
    return False


def _has_trend(data: Dict[str, Any]) -> bool:
    return _is_present(data.get("trend_result")) or _is_present(data.get("technical_indicators"))


def _has_technical_prefetch(data: Dict[str, Any]) -> bool:
    """Pipeline Step 3 already computed trend + K-line for agent runs."""
    return _has_daily_history(data) and _has_trend(data)


def _has_report_context(data: Dict[str, Any]) -> bool:
    return bool(data.get("_report_context_hydrated"))


def _has_analysis_context(data: Dict[str, Any]) -> bool:
    return _has_daily_history(data) and (_has_realtime(data) or _has_trend(data))


def _has_fundamental(data: Dict[str, Any]) -> bool:
    fc = data.get("fundamental_context")
    if not isinstance(fc, dict):
        return False
    for key in ("valuation", "company_profile", "growth", "earnings"):
        block = fc.get(key)
        if isinstance(block, dict) and block.get("status") in ("ok", "partial"):
            return True
    coverage = fc.get("coverage")
    return isinstance(coverage, dict) and bool(coverage)


# Tool name -> predicate on ctx.data; when True the tool is withheld from the LLM.
FETCH_ONCE_TOOL_PREDICATES: Dict[str, PrefetchPredicate] = {
    "get_realtime_quote": _has_realtime,
    "get_daily_history": _has_daily_history,
    "get_chip_distribution": _has_chip,
    "search_comprehensive_intel": _has_intel,
    "search_stock_news": _has_intel,
    "get_capital_flow": _has_capital_flow,
    "get_stock_info": _has_fundamental,
    "get_report_context": _has_report_context,
    "get_analysis_context": _has_analysis_context,
    # Trend is precomputed in pipeline Step 3 before agents start.
    "analyze_trend": _has_trend,
    # Derived technical tools should consume injected K-line / trend payloads.
    "calculate_ma": _has_technical_prefetch,
    "get_volume_analysis": _has_technical_prefetch,
    "analyze_pattern": _has_technical_prefetch,
}


def cache_get_present(data: Dict[str, Any], key: str) -> bool:
    value = data.get(key)
    if value is None:
        return False
    if isinstance(value, dict) and not value:
        return False
    return True


def seed_tool_cache_from_context(data: Optional[Dict[str, Any]]) -> None:
    """Mirror prefetch payloads into per-run tool cache keys when missing."""
    if not isinstance(data, dict):
        return

    if not _has_daily_history(data) and _has_kline(data.get("kline_series")):
        kline = data.get("kline_series")
        if isinstance(kline, dict):
            data["daily_history"] = {
                **kline,
                "data": kline.get("rows", kline.get("data", [])),
            }

    if not cache_get_present(data, "realtime_quote"):
        snapshot = _build_realtime_cache_from_context(data)
        if snapshot:
            data["realtime_quote"] = snapshot

    if not cache_get_present(data, "capital_flow"):
        cf = _build_capital_flow_cache_from_context(data)
        if cf:
            data["capital_flow"] = cf

    cf_payload = data.get("capital_flow")
    stock_code = str(data.get("stock_code") or "")
    if (
        isinstance(cf_payload, dict)
        and stock_code
        and cache_get_tool_result("capital_flow", stock_code=stock_code) is None
    ):
        cache_store_tool_result("capital_flow", dict(cf_payload))


def _build_realtime_cache_from_context(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    quote = data.get("realtime_quote")
    if isinstance(quote, dict) and quote.get("price") is not None:
        return dict(quote)
    enhanced = data.get("enhanced_context")
    if isinstance(enhanced, dict):
        rt = enhanced.get("realtime")
        if isinstance(rt, dict) and rt.get("price") is not None:
            return {
                "code": data.get("stock_code", ""),
                "name": data.get("stock_name", rt.get("name", "")),
                **rt,
                "source": rt.get("source", "enhanced_context"),
            }
    trend = data.get("trend_result")
    if isinstance(trend, dict) and trend.get("current_price") is not None:
        return {
            "code": data.get("stock_code", trend.get("code", "")),
            "name": data.get("stock_name", ""),
            "price": trend.get("current_price"),
            "source": "trend_result",
        }
    return None


def _build_capital_flow_cache_from_context(data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    cf = data.get("capital_flow")
    if isinstance(cf, dict) and cf:
        return dict(cf)
    fc = data.get("fundamental_context")
    if not isinstance(fc, dict):
        return None
    block = fc.get("capital_flow")
    if not isinstance(block, dict):
        return None
    status = block.get("status")
    block_data = block.get("data") or {}
    stock_flow = block_data.get("stock_flow") or {} if isinstance(block_data, dict) else {}
    sector_rankings = block_data.get("sector_rankings") or {} if isinstance(block_data, dict) else {}
    if status is None and not stock_flow and not sector_rankings:
        return None
    return {
        "stock_code": data.get("stock_code", ""),
        "status": status or ("ok" if stock_flow or sector_rankings else "partial"),
        "main_net_inflow": stock_flow.get("main_net_inflow"),
        "inflow_5d": stock_flow.get("inflow_5d"),
        "inflow_10d": stock_flow.get("inflow_10d"),
        "sector_rankings": {
            "top_inflow_sectors": sector_rankings.get("top", [])[:3],
            "top_outflow_sectors": sector_rankings.get("bottom", [])[:3],
        },
        "errors": block.get("errors") or [],
        "cached": True,
    }


def prefetch_satisfied_for_tool(tool_name: str, data: Optional[Dict[str, Any]]) -> bool:
    """Return True when prefetch already covers this fetch/search tool."""
    if not isinstance(data, dict):
        return False
    seed_tool_cache_from_context(data)
    predicate = FETCH_ONCE_TOOL_PREDICATES.get(tool_name)
    if predicate is None:
        return False
    return bool(predicate(data))


def withheld_fetch_tools(data: Optional[Dict[str, Any]]) -> Set[str]:
    if not isinstance(data, dict):
        return set()
    seed_tool_cache_from_context(data)
    return {
        name
        for name in FETCH_ONCE_TOOL_PREDICATES
        if prefetch_satisfied_for_tool(name, data)
    }


def filter_tool_names(tool_names: Iterable[str], data: Optional[Dict[str, Any]]) -> List[str]:
    """Drop fetch-once tools when prefetch data is already available."""
    withheld = withheld_fetch_tools(data)
    if not withheld:
        return list(tool_names)
    return [name for name in tool_names if name not in withheld]


def filter_tool_registry(
    registry: ToolRegistry,
    data: Optional[Dict[str, Any]],
    *,
    allowed_names: Optional[Iterable[str]] = None,
) -> ToolRegistry:
    """Return a registry copy with prefetch-satisfied fetch tools removed."""
    seed_tool_cache_from_context(data if isinstance(data, dict) else None)
    withheld = withheld_fetch_tools(data)

    names = list(allowed_names) if allowed_names is not None else registry.list_names()
    if withheld:
        names = [name for name in names if name not in withheld]

    filtered = ToolRegistry()
    for name in names:
        tool_def = registry.get(name)
        if tool_def is not None:
            filtered.register(tool_def)
    return filtered
