# -*- coding: utf-8 -*-
"""Polymarket Gamma API client for admin preview and macro context."""

from __future__ import annotations

import json
import logging
import threading
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Tuple

import requests
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from src.config import get_config

logger = logging.getLogger(__name__)

_TRANSIENT_EXCEPTIONS = (
    requests.exceptions.SSLError,
    requests.exceptions.ConnectionError,
    requests.exceptions.Timeout,
    requests.exceptions.ChunkedEncodingError,
)


class PolymarketGammaError(RuntimeError):
    """Raised when Gamma API returns an unexpected or empty payload."""


def _parse_json_list(value: Any) -> List[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            return []
        return parsed if isinstance(parsed, list) else []
    return []


def _to_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_market_outcomes(market: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Parse outcomes/outcomePrices into normalized outcome rows."""
    labels = [str(item) for item in _parse_json_list(market.get("outcomes"))]
    prices = [_to_float(item) for item in _parse_json_list(market.get("outcomePrices"))]
    rows: List[Dict[str, Any]] = []
    for index, label in enumerate(labels):
        price = prices[index] if index < len(prices) else None
        probability_pct = round(price * 100, 2) if price is not None else None
        rows.append(
            {
                "label": label,
                "price": price,
                "probabilityPct": probability_pct,
            }
        )
    return rows


def summarize_market(market: Dict[str, Any]) -> Dict[str, Any]:
    outcomes = parse_market_outcomes(market)
    return {
        "slug": str(market.get("slug") or "").strip(),
        "question": str(market.get("question") or market.get("title") or "").strip(),
        "outcomes": outcomes,
        "volume24h": _to_float(market.get("volume24hr") or market.get("volume24h")),
        "liquidity": _to_float(market.get("liquidity") or market.get("liquidityNum")),
        "active": bool(market.get("active", True)),
        "closed": bool(market.get("closed", False)),
    }


def pick_market(
    markets: Sequence[Dict[str, Any]],
    *,
    market_slug: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if not markets:
        return None
    normalized_slug = str(market_slug or "").strip()
    if normalized_slug:
        for market in markets:
            if str(market.get("slug") or "").strip() == normalized_slug:
                return market
    active_markets = [market for market in markets if market.get("closed") is not True]
    candidates = active_markets or list(markets)
    return max(
        candidates,
        key=lambda item: (
            _to_float(item.get("volume24hr") or item.get("volume24h")) or 0.0,
            _to_float(item.get("liquidity") or item.get("liquidityNum")) or 0.0,
        ),
    )


class PolymarketGammaService:
    _instance: Optional["PolymarketGammaService"] = None
    _instance_lock = threading.Lock()

    def __init__(self) -> None:
        config = get_config()
        self._base_url = (
            getattr(config, "polymarket_gamma_api_base", None)
            or "https://gamma-api.polymarket.com"
        ).rstrip("/")
        self._timeout = float(getattr(config, "polymarket_request_timeout", 8) or 8)

    @classmethod
    def get_instance(cls) -> "PolymarketGammaService":
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type(_TRANSIENT_EXCEPTIONS),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True,
    )
    def _get_json(self, path: str, *, params: Optional[Dict[str, Any]] = None) -> Any:
        url = f"{self._base_url}{path}"
        response = requests.get(url, params=params or {}, timeout=self._timeout)
        if response.status_code != 200:
            raise PolymarketGammaError(
                f"Gamma API {path} returned HTTP {response.status_code}"
            )
        return response.json()

    def fetch_event_by_slug(self, slug: str) -> Dict[str, Any]:
        normalized_slug = str(slug or "").strip()
        if not normalized_slug:
            raise PolymarketGammaError("slug 不能为空")
        payload = self._get_json("/events", params={"slug": normalized_slug})
        if isinstance(payload, list):
            if not payload:
                raise PolymarketGammaError(f"未找到 event slug: {normalized_slug}")
            return payload[0]
        if isinstance(payload, dict):
            return payload
        raise PolymarketGammaError(f"event 响应格式异常: {normalized_slug}")

    def fetch_market_by_slug(self, slug: str) -> Dict[str, Any]:
        normalized_slug = str(slug or "").strip()
        if not normalized_slug:
            raise PolymarketGammaError("slug 不能为空")
        payload = self._get_json("/markets", params={"slug": normalized_slug})
        if isinstance(payload, list):
            if not payload:
                raise PolymarketGammaError(f"未找到 market slug: {normalized_slug}")
            return payload[0]
        if isinstance(payload, dict):
            return payload
        raise PolymarketGammaError(f"market 响应格式异常: {normalized_slug}")

    def preview(
        self,
        *,
        slug_type: str,
        slug: str,
        market_slug: Optional[str] = None,
        outcome_label: str = "Yes",
    ) -> Dict[str, Any]:
        normalized_type = str(slug_type or "").strip().lower()
        normalized_slug = str(slug or "").strip()
        if normalized_type not in {"event", "market"}:
            raise PolymarketGammaError("slug_type 仅支持 event 或 market")
        if not normalized_slug:
            raise PolymarketGammaError("slug 不能为空")

        fetched_at = datetime.now().isoformat(timespec="seconds")
        if normalized_type == "market":
            market = self.fetch_market_by_slug(normalized_slug)
            selected = summarize_market(market)
            return {
                "slugType": normalized_type,
                "slug": normalized_slug,
                "title": str(market.get("question") or market.get("title") or "").strip(),
                "question": selected["question"],
                "markets": [selected],
                "selectedMarket": selected,
                "selectedOutcome": self._pick_outcome(selected["outcomes"], outcome_label),
                "fetchedAt": fetched_at,
            }

        event = self.fetch_event_by_slug(normalized_slug)
        raw_markets = event.get("markets") or []
        if not isinstance(raw_markets, list):
            raw_markets = []
        market_rows = [summarize_market(item) for item in raw_markets if isinstance(item, dict)]
        selected_raw = pick_market(raw_markets, market_slug=market_slug)
        if selected_raw is None:
            raise PolymarketGammaError(f"event 未包含可用 market: {normalized_slug}")
        selected = summarize_market(selected_raw)
        return {
            "slugType": normalized_type,
            "slug": normalized_slug,
            "title": str(event.get("title") or event.get("name") or "").strip(),
            "question": selected["question"],
            "markets": market_rows,
            "selectedMarket": selected,
            "selectedOutcome": self._pick_outcome(selected["outcomes"], outcome_label),
            "fetchedAt": fetched_at,
        }

    @staticmethod
    def _pick_outcome(
        outcomes: Sequence[Dict[str, Any]],
        outcome_label: str,
    ) -> Optional[Dict[str, Any]]:
        target = str(outcome_label or "Yes").strip().lower()
        for item in outcomes:
            if str(item.get("label") or "").strip().lower() == target:
                return dict(item)
        return dict(outcomes[0]) if outcomes else None
