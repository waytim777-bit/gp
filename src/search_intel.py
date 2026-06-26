# -*- coding: utf-8 -*-
"""Helpers for multi-dimensional stock intelligence search."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

# Core stock dimensions (6) + external environment dimensions (3).
COMPREHENSIVE_INTEL_DEFAULT_MAX_SEARCHES = 9

_EXTERNAL_INTEL_DIMENSION_NAMES = frozenset(
    {"industry_news", "intl_news", "cn_policy"}
)


def resolve_intel_industry_label(
    *,
    stock_code: str,
    stock_name: str,
    fundamental_context: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """Best-effort industry label for external-news search queries."""
    candidates: List[str] = []
    name = (stock_name or "").strip()

    if isinstance(fundamental_context, dict):
        profile_block = fundamental_context.get("company_profile")
        profile_data = (
            profile_block.get("data")
            if isinstance(profile_block, dict)
            else profile_block
        )
        if isinstance(profile_data, dict):
            for key in ("industry", "sector", "sw_industry", "gics_industry"):
                value = profile_data.get(key)
                if isinstance(value, str) and value.strip():
                    candidates.append(value.strip())

        boards = fundamental_context.get("belong_boards")
        if isinstance(boards, list):
            for board in boards:
                if not isinstance(board, dict):
                    continue
                board_name = str(board.get("name") or board.get("board_name") or "").strip()
                board_type = str(board.get("board_type") or board.get("type") or "").strip()
                if not board_name:
                    continue
                if "行业" in board_type or "industry" in board_type.lower():
                    cleaned = board_name.replace("行业", "").strip()
                    if cleaned:
                        candidates.append(cleaned)

    seen = set()
    for candidate in candidates:
        normalized = candidate.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        if name and normalized == name:
            continue
        return normalized

    return None


def intel_subject_label(
    *,
    industry: Optional[str],
    stock_name: str,
) -> str:
    """Subject token used in external-intel search queries."""
    cleaned_industry = (industry or "").strip()
    if cleaned_industry:
        return cleaned_industry
    cleaned_name = (stock_name or "").strip()
    return cleaned_name or "相关行业"


def build_external_intel_dimensions(
    *,
    stock_code: str,
    stock_name: str,
    industry: Optional[str] = None,
    is_foreign: bool = False,
    is_index_etf: bool = False,
) -> List[Dict[str, Any]]:
    """Return industry / international / policy search dimensions."""
    if is_index_etf:
        subject = intel_subject_label(industry=industry, stock_name=stock_name)
        return [
            {
                "name": "industry_news",
                "query": f"{stock_name} {stock_code} 指数 成分股 行业配置 景气度",
                "desc": "行业新闻",
                "tavily_topic": None,
                "strict_freshness": False,
            },
            {
                "name": "intl_news",
                "query": f"{stock_name} 全球 市场 资金流向 国际形势",
                "desc": "国际新闻",
                "tavily_topic": "news",
                "strict_freshness": True,
            },
            {
                "name": "cn_policy",
                "query": f"中国 资本市场 指数 政策 监管 {subject}",
                "desc": "中国政策",
                "tavily_topic": None,
                "strict_freshness": False,
            },
        ]

    subject = intel_subject_label(industry=industry, stock_name=stock_name)

    if is_foreign:
        return [
            {
                "name": "industry_news",
                "query": f"{subject} sector industry outlook demand competition latest",
                "desc": "行业新闻",
                "tavily_topic": None,
                "strict_freshness": False,
            },
            {
                "name": "intl_news",
                "query": (
                    f"{stock_name} {stock_code} global trade geopolitics supply chain "
                    f"tariff international"
                ),
                "desc": "国际新闻",
                "tavily_topic": "news",
                "strict_freshness": True,
            },
            {
                "name": "cn_policy",
                "query": f"China policy {subject} export tariff regulation impact",
                "desc": "中国政策",
                "tavily_topic": None,
                "strict_freshness": False,
            },
        ]

    return [
        {
            "name": "industry_news",
            "query": f"{subject} 行业 景气度 订单 价格 产能 供需 最新消息",
            "desc": "行业新闻",
            "tavily_topic": None,
            "strict_freshness": False,
        },
        {
            "name": "intl_news",
            "query": (
                f"{subject} 全球 出口 关税 供应链 海外需求 国际形势 地缘政治"
            ),
            "desc": "国际新闻",
            "tavily_topic": "news",
            "strict_freshness": True,
        },
        {
            "name": "cn_policy",
            "query": (
                f"中国 {subject} 政策 监管 补贴 限制 发改委 工信部 国务院 利空"
            ),
            "desc": "中国政策",
            "tavily_topic": None,
            "strict_freshness": False,
        },
    ]
