# -*- coding: utf-8 -*-
"""Load homepage analysis records and hydrate agent prefetch context for follow-up chat."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

PREFETCH_CONTEXT_KEYS = (
    "realtime_quote",
    "daily_history",
    "kline_series",
    "weekly_kline_series",
    "chip_distribution",
    "trend_result",
    "technical_indicators",
    "news_context",
    "intel_comprehensive",
    "fundamental_context",
    "capital_flow",
    "stock_news",
    "enhanced_context",
)


def _compact_snapshot_list(value: Any, *, limit: int) -> Any:
    if not isinstance(value, list):
        return value
    if limit <= 0:
        return []
    if len(value) <= limit:
        return value
    return value[-limit:]


def compact_report_context_snapshot(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    """Compact a pipeline context_snapshot payload for agent reuse."""
    enhanced = snapshot.get("enhanced_context") or {}
    news_content = snapshot.get("news_content")
    realtime_raw = snapshot.get("realtime_quote_raw")
    chip_raw = snapshot.get("chip_distribution_raw")

    result: Dict[str, Any] = {
        "enhanced_context": enhanced,
        "news_content": news_content,
        "realtime_quote_raw": realtime_raw,
        "chip_distribution_raw": chip_raw,
    }

    if isinstance(enhanced, dict):
        for key in ("raw_data", "daily_data", "daily_history", "kline", "kline_data"):
            if key in enhanced:
                enhanced[key] = _compact_snapshot_list(enhanced.get(key), limit=80)

    return result


def _resolve_news_content(row: Any, compact_snapshot: Optional[Dict[str, Any]]) -> Optional[str]:
    """Prefer analysis_history.news_content column; fall back to snapshot."""
    raw = getattr(row, "news_content", None)
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    if isinstance(compact_snapshot, dict):
        snap_news = compact_snapshot.get("news_content")
        if isinstance(snap_news, str) and snap_news.strip():
            return snap_news.strip()
    return None


def _wrap_news_as_intel_comprehensive(news_content: str) -> Dict[str, Any]:
    """Match IntelAgent post_process shape so prefetch policy can withhold search tools."""
    return {
        "report": news_content,
        "source": "analysis_history",
        "reused": True,
    }


def _build_intel_from_news_intel_db(
    db: Any,
    *,
    query_id: str,
    owner_user_id: Optional[int],
    limit: int = 30,
) -> Optional[Dict[str, Any]]:
    """Rebuild a compact intel payload from persisted news_intel rows."""
    if not query_id:
        return None
    try:
        records = db.get_news_intel_by_query_id(
            query_id=query_id,
            limit=limit,
            owner_user_id=owner_user_id,
        )
    except Exception:
        records = []
    if not records:
        return None

    dimensions: Dict[str, Any] = {}
    report_lines: List[str] = []
    for record in records:
        dim = getattr(record, "dimension", None) or "latest_news"
        title = (getattr(record, "title", None) or "").strip()
        snippet = (getattr(record, "snippet", None) or "").strip()
        if not title:
            continue
        bucket = dimensions.setdefault(
            dim,
            {
                "query": getattr(record, "query", None) or "",
                "results_count": 0,
                "results": [],
            },
        )
        bucket["results"].append(
            {
                "title": title,
                "snippet": snippet[:200] if snippet else "",
                "source": getattr(record, "source", None) or "",
            }
        )
        bucket["results_count"] += 1
        if len(report_lines) < 20:
            report_lines.append(f"- [{dim}] {title}: {snippet[:160]}")

    if not report_lines:
        return None

    return {
        "report": "\n".join(report_lines),
        "dimensions": dimensions,
        "source": "db_news_intel",
        "reused": True,
    }


def load_report_context_by_id(record_id: int, *, days: int = 60) -> Dict[str, Any]:
    """Load a previous analysis record's snapshot and DB-cached daily data."""
    rid = int(record_id)
    if rid <= 0:
        return {"error": "record_id must be a positive integer"}

    from src.storage import get_db
    from src.user_context import get_current_user_id

    db = get_db()
    row = db.get_analysis_history_by_id(rid)
    if row is None:
        return {"error": f"Analysis record not found: {rid}"}

    owner_id = get_current_user_id()
    if owner_id is not None and int(getattr(row, "owner_user_id", 0) or 0) != int(owner_id):
        return {"error": "Record does not belong to current user"}

    snapshot_raw = getattr(row, "context_snapshot", None) or ""
    snapshot_obj: Optional[Dict[str, Any]] = None
    if isinstance(snapshot_raw, str) and snapshot_raw.strip():
        try:
            loaded = json.loads(snapshot_raw)
            if isinstance(loaded, dict):
                snapshot_obj = loaded
        except Exception:
            snapshot_obj = None

    compact_snapshot = compact_report_context_snapshot(snapshot_obj) if snapshot_obj else None

    code = getattr(row, "code", "") or ""
    stock_name = getattr(row, "name", "") or ""
    query_id = getattr(row, "query_id", "") or ""
    news_content = _resolve_news_content(row, compact_snapshot)
    intel_comprehensive: Optional[Dict[str, Any]] = None
    if news_content:
        intel_comprehensive = _wrap_news_as_intel_comprehensive(news_content)
    else:
        intel_comprehensive = _build_intel_from_news_intel_db(
            db,
            query_id=query_id,
            owner_user_id=owner_id,
        )
        if isinstance(intel_comprehensive, dict):
            report = intel_comprehensive.get("report")
            if isinstance(report, str) and report.strip():
                news_content = report.strip()

    daily_records: List[Dict[str, Any]] = []
    if code:
        try:
            capped_days = max(1, min(int(days), 180))
            recent = db.get_latest_data(code, days=capped_days)
            for item in reversed(list(recent)):
                daily_records.append(item.to_dict())
        except Exception:
            daily_records = []

    return {
        "record_id": rid,
        "stock_code": code,
        "stock_name": stock_name,
        "query_id": query_id,
        "context_snapshot": compact_snapshot,
        "daily_history": {
            "code": code,
            "total_records": len(daily_records),
            "data": daily_records,
            "source": "db",
        } if daily_records else None,
        "news_content": news_content,
        "intel_comprehensive": intel_comprehensive,
        "chip_distribution": (compact_snapshot or {}).get("chip_distribution_raw") if compact_snapshot else None,
        "realtime_quote": (compact_snapshot or {}).get("realtime_quote_raw") if compact_snapshot else None,
    }


def report_context_to_agent_prefetch(bundle: Dict[str, Any]) -> Dict[str, Any]:
    """Map a report context bundle into agent run prefetch keys."""
    if not isinstance(bundle, dict) or bundle.get("error"):
        return {}

    payload: Dict[str, Any] = {"_report_context_hydrated": True}
    code = str(bundle.get("stock_code") or "")

    snapshot = bundle.get("context_snapshot") or {}
    enhanced = snapshot.get("enhanced_context") if isinstance(snapshot, dict) else {}
    if not isinstance(enhanced, dict):
        enhanced = {}

    if enhanced:
        payload["enhanced_context"] = enhanced

    daily = bundle.get("daily_history")
    if isinstance(daily, dict) and daily.get("data"):
        payload["daily_history"] = daily
        rows = daily.get("data")
        if isinstance(rows, list) and rows:
            payload["kline_series"] = {
                "code": code,
                "rows": rows,
                "total_records": daily.get("total_records", len(rows)),
                "source": daily.get("source", "db"),
            }

    if not payload.get("daily_history"):
        kline = enhanced.get("kline_series") or enhanced.get("daily_bars")
        if isinstance(kline, dict):
            rows = kline.get("rows") or kline.get("data")
            if isinstance(rows, list) and rows:
                payload["kline_series"] = kline
                payload["daily_history"] = {
                    **kline,
                    "code": code,
                    "data": rows,
                }

    rt = bundle.get("realtime_quote")
    if isinstance(rt, dict) and rt:
        payload["realtime_quote"] = rt

    chip = bundle.get("chip_distribution")
    if isinstance(chip, dict) and chip:
        payload["chip_distribution"] = chip
    elif isinstance(enhanced.get("chip_distribution"), dict) and enhanced.get("chip_distribution"):
        payload["chip_distribution"] = enhanced["chip_distribution"]

    trend = enhanced.get("trend_analysis")
    if isinstance(trend, dict) and trend:
        payload["trend_result"] = trend

    technical = enhanced.get("technical_indicators")
    if isinstance(technical, dict) and technical:
        payload["technical_indicators"] = technical

    fundamental = enhanced.get("fundamental_context")
    if isinstance(fundamental, dict) and fundamental:
        payload["fundamental_context"] = fundamental

    capital_flow = enhanced.get("capital_flow")
    if isinstance(capital_flow, dict) and capital_flow:
        payload["capital_flow"] = capital_flow

    weekly = enhanced.get("weekly_kline_series")
    if isinstance(weekly, dict) and weekly:
        payload["weekly_kline_series"] = weekly

    news = bundle.get("news_content") or snapshot.get("news_content")
    if isinstance(news, str) and news.strip():
        payload["news_context"] = news

    intel = bundle.get("intel_comprehensive")
    if isinstance(intel, dict) and intel:
        payload["intel_comprehensive"] = intel
    elif payload.get("news_context"):
        payload["intel_comprehensive"] = _wrap_news_as_intel_comprehensive(
            str(payload["news_context"])
        )

    stock_name = bundle.get("stock_name")
    if isinstance(stock_name, str) and stock_name.strip():
        payload["stock_name"] = stock_name.strip()

    if code:
        payload["stock_code"] = code

    record_id = bundle.get("record_id")
    if record_id is not None:
        payload["record_id"] = record_id

    return payload


def _has_sufficient_chat_prefetch(context: Dict[str, Any]) -> bool:
    """Return True when follow-up chat already has enough data to skip record reload."""
    from src.agent.prefetch_policy import _has_daily_history, _has_realtime, _has_trend

    if context.get("_report_context_hydrated"):
        return True
    if not _has_daily_history(context):
        return False
    return _has_realtime(context) or _has_trend(context)


def hydrate_context_from_record(
    context: Optional[Dict[str, Any]],
    *,
    days: int = 60,
) -> Dict[str, Any]:
    """Merge report record prefetch into *context* when ``record_id`` is present."""
    if not isinstance(context, dict):
        return {}

    out = dict(context)
    record_id = out.get("record_id")
    if record_id is None:
        return out

    try:
        rid = int(record_id)
    except (TypeError, ValueError):
        return out
    if rid <= 0:
        return out

    if _has_sufficient_chat_prefetch(out):
        out.setdefault("_report_context_hydrated", True)
        return out

    bundle = load_report_context_by_id(rid, days=days)
    if bundle.get("error"):
        logger.warning(
            "[report_context] hydrate skipped for record_id=%s: %s",
            rid,
            bundle.get("error"),
        )
        return out

    prefetch = report_context_to_agent_prefetch(bundle)
    merged_keys: List[str] = []
    for key, value in prefetch.items():
        if value is None:
            continue
        if not out.get(key):
            out[key] = value
            merged_keys.append(key)

    if merged_keys:
        logger.info(
            "[report_context] hydrated record_id=%s merged_keys=%s",
            rid,
            sorted(merged_keys),
        )
    return out


def apply_prefetch_to_agent_data(target: Dict[str, Any], source: Dict[str, Any]) -> None:
    """Copy known prefetch keys from *source* into an agent ctx.data mapping."""
    for key in PREFETCH_CONTEXT_KEYS:
        value = source.get(key)
        if value is not None and not target.get(key):
            target[key] = value
    if source.get("_report_context_hydrated"):
        target["_report_context_hydrated"] = True
    if source.get("record_id") is not None:
        target.setdefault("record_id", source["record_id"])
