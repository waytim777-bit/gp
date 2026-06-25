# -*- coding: utf-8 -*-
"""Helpers for prediction report listing version selection."""

from __future__ import annotations

from typing import Any, Dict, List, TypeVar

from src.services.stock_code_utils import resolve_lookup_stock_code

ListingDict = TypeVar("ListingDict", bound=Dict[str, Any])


def listing_version_key(item: Dict[str, Any]) -> tuple:
    version = int(item.get("cycle_version") or 1)
    analyzed_at = item.get("analyzed_at") or item.get("created_at") or ""
    listing_id = int(item.get("id") or 0)
    return (version, str(analyzed_at), listing_id)


def pick_latest_listing_per_stock(items: List[ListingDict]) -> List[ListingDict]:
    """Keep one listing per stock code (normalized), preferring the highest cycle version."""
    best: Dict[str, ListingDict] = {}
    for item in items:
        code_key = resolve_lookup_stock_code(str(item.get("code") or ""))
        if not code_key:
            continue
        existing = best.get(code_key)
        if existing is None or listing_version_key(item) > listing_version_key(existing):
            best[code_key] = item
    return sorted(best.values(), key=listing_version_key, reverse=True)
