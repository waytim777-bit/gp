# -*- coding: utf-8 -*-
"""Request-scoped cache for a single stock analysis agent run."""

from __future__ import annotations

import logging
from contextlib import contextmanager
from contextvars import ContextVar, Token
from typing import Any, Dict, Iterator, Optional

logger = logging.getLogger(__name__)

_agent_run_cache: ContextVar[Optional[Dict[str, Any]]] = ContextVar("agent_run_cache", default=None)
_agent_run_stock_code: ContextVar[str] = ContextVar("agent_run_stock_code", default="")


def get_agent_run_cache() -> Optional[Dict[str, Any]]:
    """Return the mutable cache dict for the current agent run, if bound."""
    return _agent_run_cache.get()


def get_agent_run_stock_code() -> str:
    return _agent_run_stock_code.get() or ""


def bind_agent_run_cache(
    cache: Optional[Dict[str, Any]],
    *,
    stock_code: str = "",
) -> tuple[Token, Token]:
    """Bind a shared cache dict for tool handlers in the current context."""
    cache_token = _agent_run_cache.set(cache if isinstance(cache, dict) else None)
    code_token = _agent_run_stock_code.set(str(stock_code or ""))
    return cache_token, code_token


def reset_agent_run_cache(cache_token: Token, code_token: Token) -> None:
    _agent_run_cache.reset(cache_token)
    _agent_run_stock_code.reset(code_token)


@contextmanager
def agent_run_cache_scope(
    cache: Optional[Dict[str, Any]],
    *,
    stock_code: str = "",
) -> Iterator[Dict[str, Any]]:
    """Context manager that exposes a mutable per-run cache to tool handlers."""
    store: Dict[str, Any] = cache if isinstance(cache, dict) else {}
    tokens = bind_agent_run_cache(store, stock_code=stock_code)
    try:
        yield store
    finally:
        reset_agent_run_cache(*tokens)


def cache_get(key: str) -> Any:
    cache = get_agent_run_cache()
    if cache is None:
        return None
    return cache.get(key)


def cache_set(key: str, value: Any) -> None:
    cache = get_agent_run_cache()
    if cache is None or value is None:
        return
    cache[key] = value


def cache_has(key: str) -> bool:
    value = cache_get(key)
    return value is not None


def cache_get_tool_result(cache_key: str, *, stock_code: str = "") -> Optional[dict]:
    """Return a cached tool payload when present for the current analysis run."""
    bound_code = get_agent_run_stock_code()
    if bound_code and stock_code:
        from data_provider.base import normalize_stock_code

        if normalize_stock_code(bound_code) != normalize_stock_code(stock_code):
            return None
    payload = cache_get(cache_key)
    if isinstance(payload, dict):
        return dict(payload)
    return None


def cache_store_tool_result(cache_key: str, payload: dict) -> dict:
    cache_set(cache_key, payload)
    return payload
