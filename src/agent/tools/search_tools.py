# -*- coding: utf-8 -*-
"""
Search tools — wraps SearchService methods as agent-callable tools.

Tools:
- search_stock_news: search latest stock news
- search_comprehensive_intel: multi-dimensional intelligence search
"""

import logging
from typing import Any, Dict, Optional

from src.agent.tools.cache_helpers import run_cached_tool
from src.agent.tools.registry import ToolParameter, ToolDefinition

logger = logging.getLogger(__name__)


def _get_search_service():
    """Return shared SearchService singleton."""
    from src.search_service import get_search_service
    return get_search_service()


def build_comprehensive_intel_tool_result(
    intel_results: Dict[str, Any],
    stock_name: str,
    *,
    service=None,
) -> Dict[str, Any]:
    """Format comprehensive intel search results into the agent tool payload."""
    search_service = service or _get_search_service()
    report = search_service.format_intel_report(intel_results, stock_name)
    dimensions: Dict[str, Any] = {}
    for dim_name, response in intel_results.items():
        if response and getattr(response, "success", False):
            dimensions[dim_name] = {
                "query": response.query,
                "results_count": len(response.results),
                "results": [
                    {
                        "title": r.get("title") if isinstance(r, dict) else r.title,
                        "snippet": r.get("snippet") if isinstance(r, dict) else r.snippet,
                        "source": r.get("source") if isinstance(r, dict) else r.source,
                    }
                    for r in response.results[:3]
                ],
            }
    return {
        "report": report,
        "dimensions": dimensions,
    }


def build_stock_news_tool_result(
    stock_code: str,
    stock_name: str,
    *,
    service=None,
    max_results: int = 5,
) -> Dict[str, Any]:
    search_service = service or _get_search_service()
    response = search_service.search_stock_news(stock_code, stock_name, max_results=max_results)
    if not response.success:
        return {
            "query": response.query,
            "success": False,
            "error": response.error_message,
        }
    return {
        "query": response.query,
        "provider": response.provider,
        "success": True,
        "results_count": len(response.results),
        "results": [
            {
                "title": r.title,
                "snippet": r.snippet,
                "url": r.url,
                "source": r.source,
                "published_date": r.published_date,
            }
            for r in response.results
        ],
    }


def _handle_search_stock_news(stock_code: str, stock_name: str) -> dict:
    """Search latest news for a stock."""
    service = _get_search_service()
    if not service.is_available:
        return {"error": "No search engine available (no API keys configured)"}

    return run_cached_tool(
        cache_key="stock_news",
        stock_code=stock_code,
        fetcher=lambda: build_stock_news_tool_result(stock_code, stock_name, service=service),
    )


search_stock_news_tool = ToolDefinition(
    name="search_stock_news",
    description="Search for the latest news articles about a specific stock. "
                "Requires both stock_code and stock_name for accurate search. "
                "Returns news titles, snippets, sources, and URLs.",
    parameters=[
        ToolParameter(
            name="stock_code",
            type="string",
            description="Stock code, e.g., '600519'",
        ),
        ToolParameter(
            name="stock_name",
            type="string",
            description="Stock name in Chinese, e.g., '贵州茅台'",
        ),
    ],
    handler=_handle_search_stock_news,
    category="search",
)


# ============================================================
# search_comprehensive_intel
# ============================================================

def _handle_search_comprehensive_intel(stock_code: str, stock_name: str) -> dict:
    """Multi-dimensional intelligence search."""
    service = _get_search_service()
    if not service.is_available:
        return {"error": "No search engine available (no API keys configured)"}

    def _fetch() -> Dict[str, Any]:
        intel_results = service.search_comprehensive_intel(
            stock_code=stock_code,
            stock_name=stock_name,
            max_searches=6,
        )
        if not intel_results:
            return {"error": "Comprehensive intel search returned no results"}
        return build_comprehensive_intel_tool_result(intel_results, stock_name, service=service)

    return run_cached_tool(
        cache_key="intel_comprehensive",
        stock_code=stock_code,
        fetcher=_fetch,
    )


search_comprehensive_intel_tool = ToolDefinition(
    name="search_comprehensive_intel",
    description="Multi-dimensional intelligence search: latest news, market analysis, "
                "risk checking, earnings outlook, and industry trends for a stock. "
                "Returns a formatted report and structured results.",
    parameters=[
        ToolParameter(
            name="stock_code",
            type="string",
            description="Stock code, e.g., '600519'",
        ),
        ToolParameter(
            name="stock_name",
            type="string",
            description="Stock name in Chinese, e.g., '贵州茅台'",
        ),
    ],
    handler=_handle_search_comprehensive_intel,
    category="search",
)


ALL_SEARCH_TOOLS = [
    search_stock_news_tool,
    search_comprehensive_intel_tool,
]
