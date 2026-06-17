# -*- coding: utf-8 -*-
"""Helpers for cache-first agent tool handlers."""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, Optional

from src.agent.run_context import cache_get_tool_result, cache_store_tool_result

logger = logging.getLogger(__name__)


def run_cached_tool(
    *,
    cache_key: str,
    stock_code: str,
    fetcher: Callable[[], Dict[str, Any]],
) -> Dict[str, Any]:
    """Return cached tool output for this run, otherwise fetch once and store."""
    cached = cache_get_tool_result(cache_key, stock_code=stock_code)
    if cached is not None:
        logger.info("Tool cache hit: %s (%s)", cache_key, stock_code)
        hit = dict(cached)
        hit["cached"] = True
        return hit

    payload = fetcher()
    if isinstance(payload, dict) and "error" not in payload:
        stored = dict(payload)
        stored["cached"] = False
        cache_store_tool_result(cache_key, stored)
        return stored
    return payload
