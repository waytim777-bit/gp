# -*- coding: utf-8 -*-
"""Resolve how agent chat requests should be executed."""

from __future__ import annotations

from typing import Any, Dict, Optional

_INCREMENTAL_KEYWORDS = (
    "增量",
    "最新动态",
    "刷新数据",
    "重新分析",
    "重新拉",
    "查最新",
    "竞品对比",
    "重新搜索",
    "补充检索",
)


def message_implies_incremental(message: str) -> bool:
    """Return True when the user explicitly asks for fresh data / re-analysis."""
    text = (message or "").strip().lower()
    if not text:
        return False
    return any(keyword in text for keyword in _INCREMENTAL_KEYWORDS)


def resolve_chat_execution_mode(
    context: Optional[Dict[str, Any]],
    message: str,
) -> str:
    """Return one of: ``report_interpret``, ``incremental``, ``agent``.

    * ``report_interpret`` — Q&A on an existing homepage report (no pipeline)
    * ``incremental`` — full agent path with optional record context
    * ``agent`` — standard ask-stock chat without report follow-up
    """
    ctx = context if isinstance(context, dict) else {}
    record_id = ctx.get("record_id")
    chat_mode = str(ctx.get("chat_mode") or "").strip().lower()

    if chat_mode == "incremental" or message_implies_incremental(message):
        return "incremental"
    if record_id is not None:
        try:
            if int(record_id) > 0:
                return "report_interpret"
        except (TypeError, ValueError):
            pass
    return "agent"
