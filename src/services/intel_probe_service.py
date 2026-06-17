# -*- coding: utf-8 -*-
"""Incremental intel probe for prediction-cycle shared analysis."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import List, Optional, Set

from src.search_service import SearchResponse, get_search_service

logger = logging.getLogger(__name__)

_URL_PATTERN = re.compile(r"https?://[^\s\])>\"']+")


@dataclass
class IntelProbeResult:
    attempted: bool = False
    has_new_intel: bool = False
    search_failed: bool = False
    new_urls: List[str] = field(default_factory=list)


def parse_news_fingerprint(raw: Optional[str]) -> Set[str]:
    if not raw:
        return set()
    try:
        payload = json.loads(raw)
        if isinstance(payload, list):
            return {str(item).strip() for item in payload if str(item).strip()}
    except Exception:
        pass
    return set()


def build_news_fingerprint(urls: List[str]) -> str:
    normalized = sorted({str(url).strip() for url in urls if str(url).strip()})
    return json.dumps(normalized, ensure_ascii=False)


def extract_urls_from_news_content(news_content: Optional[str]) -> List[str]:
    if not news_content:
        return []
    return list(dict.fromkeys(_URL_PATTERN.findall(news_content)))


def _result_url(result: object) -> str:
    for attr in ("url", "link"):
        value = getattr(result, attr, None)
        if value:
            return str(value).strip()
    return ""


def _result_published_date(result: object) -> Optional[date]:
    value = getattr(result, "published_date", None)
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def probe_new_intel(
    *,
    stock_code: str,
    stock_name: str,
    since: datetime,
    known_urls: Set[str],
    max_results: int = 8,
) -> IntelProbeResult:
    """
    Search for news since the last canonical analysis.

    Fail-open: search errors are treated as no new intel.
    """
    result = IntelProbeResult(attempted=True)
    try:
        response: SearchResponse = get_search_service().search_stock_news(
            stock_code,
            stock_name or stock_code,
            max_results=max_results,
        )
    except Exception as exc:
        logger.warning("Intel probe search failed for %s: %s", stock_code, exc)
        result.search_failed = True
        return result

    if not response.success:
        logger.warning(
            "Intel probe search unsuccessful for %s: %s",
            stock_code,
            response.error_message,
        )
        result.search_failed = True
        return result

    since_date = since.date()
    new_urls: List[str] = []
    for item in response.results:
        url = _result_url(item)
        if not url or url in known_urls:
            continue
        published = _result_published_date(item)
        if published is not None and published < since_date:
            continue
        new_urls.append(url)

    result.new_urls = new_urls
    result.has_new_intel = bool(new_urls)
    return result
