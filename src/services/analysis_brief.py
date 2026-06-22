# -*- coding: utf-8 -*-
"""Build briefs for multi-model consultation.

Consultation models receive a **facts-only** brief (market, trend, news, etc.)
so they are not anchored on the primary model's scores or narrative.
Primary conclusions are shown in the UI column only, not re-sent to consult LLMs.
"""

from __future__ import annotations

import json
from typing import Any, Dict, Optional

_BRIEF_FIELD_LIMIT = 4000
_NEWS_LIMIT = 3500
_FUNDAMENTAL_LIMIT = 2500


def _truncate(value: Any, limit: int = _BRIEF_FIELD_LIMIT) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        try:
            text = json.dumps(value, ensure_ascii=False, default=str)
        except (TypeError, ValueError):
            text = str(value)
    else:
        text = str(value)
    if len(text) <= limit:
        return text
    return text[:limit] + "...(truncated)"


def _pick_quote(context: Dict[str, Any]) -> Dict[str, Any]:
    quote = context.get("realtime_quote")
    if isinstance(quote, dict) and quote:
        return quote
    enhanced = context.get("enhanced_context") or {}
    realtime = enhanced.get("realtime") or {}
    if isinstance(realtime, dict) and realtime:
        return realtime
    raw = context.get("realtime_quote_raw") or {}
    return raw if isinstance(raw, dict) else {}


def _compact_fundamental_for_brief(context: Dict[str, Any]) -> Dict[str, Any]:
    """Extract valuation / growth / profile snippets without full raw blocks."""
    fc = context.get("fundamental_context")
    if not isinstance(fc, dict):
        return {}

    compact: Dict[str, Any] = {}
    for key in ("company_profile", "valuation", "growth", "earnings", "capital_flow"):
        block = fc.get(key)
        if not isinstance(block, dict):
            continue
        data = block.get("data")
        if isinstance(data, dict) and data:
            compact[key] = {
                "status": block.get("status"),
                "data": data,
            }
        elif block.get("status"):
            compact[key] = {"status": block.get("status")}
    return compact


def build_consultation_facts_brief(
    *,
    stock_code: str,
    stock_name: str,
    context: Dict[str, Any],
    report_language: str = "zh",
) -> Dict[str, Any]:
    """Facts-only brief for read-only consultation models (no primary conclusions)."""
    trend_block = context.get("trend_result") or context.get("technical_indicators")
    intel = context.get("intel_comprehensive")
    news_text = context.get("news_context")
    if not news_text and isinstance(intel, dict):
        news_text = intel.get("report")

    return {
        "version": 2,
        "brief_kind": "facts_only",
        "report_language": report_language,
        "stock_code": stock_code,
        "stock_name": stock_name,
        "market": _truncate(_pick_quote(context), 1500),
        "trend": _truncate(trend_block, 2500),
        "chip_distribution": _truncate(context.get("chip_distribution"), 1200),
        "capital_flow": _truncate(context.get("capital_flow"), 1500),
        "fundamental": _truncate(_compact_fundamental_for_brief(context), _FUNDAMENTAL_LIMIT),
        "news_excerpt": _truncate(news_text, _NEWS_LIMIT),
        "risk_flags": _truncate(context.get("risk_flags"), 1500),
    }


def build_analysis_brief(
    *,
    stock_code: str,
    stock_name: str,
    context: Dict[str, Any],
    sentiment_score: Optional[int] = None,
    operation_advice: Optional[str] = None,
    trend_prediction: Optional[str] = None,
    analysis_summary: Optional[str] = None,
    dashboard: Optional[Dict[str, Any]] = None,
    primary_model: Optional[str] = None,
    report_language: str = "zh",
) -> Dict[str, Any]:
    """Full audit brief (facts + primary conclusion) for persistence / debugging."""
    dash = dashboard if isinstance(dashboard, dict) else {}
    core = (dash.get("dashboard") or {}).get("core_conclusion") or dash.get("core_conclusion") or {}

    brief = build_consultation_facts_brief(
        stock_code=stock_code,
        stock_name=stock_name,
        context=context,
        report_language=report_language,
    )
    brief["brief_kind"] = "audit_with_primary"
    brief["primary_model"] = primary_model or ""
    brief["primary_conclusion"] = {
        "sentiment_score": sentiment_score,
        "operation_advice": operation_advice,
        "trend_prediction": trend_prediction,
        "analysis_summary": analysis_summary,
        "one_sentence": core.get("one_sentence") if isinstance(core, dict) else None,
        "signal_type": core.get("signal_type") if isinstance(core, dict) else None,
    }
    return brief


def format_consultation_prompt(facts_brief: Dict[str, Any], *, report_language: str = "zh") -> str:
    """Render facts-only brief for independent consultation models."""
    if report_language == "en":
        instructions = (
            "You are an **independent** equity analyst on a consultation panel.\n"
            "The JSON below contains **factual inputs only** (quotes, indicators, news excerpts). "
            "It deliberately excludes any prior model's scores, advice, or narrative.\n"
            "Form your **own** view from these facts. Do not assume another analyst already "
            "decided correctly. If facts are mixed, reflect that in score and wording.\n"
            "Do not invent numbers or news. Output a single JSON object with keys:\n"
            "sentiment_score (0-100 int), trend_prediction (string), operation_advice (string), "
            "confidence (High|Medium|Low), summary (2-3 sentences), reasoning (1-2 sentences), "
            "bull_case (1 sentence: strongest bullish argument from facts), "
            "bear_case (1 sentence: strongest bearish argument from facts), "
            "dissent_note (1 sentence: a reasonable opposite stance someone could take).\n"
        )
    else:
        instructions = (
            "你是会诊 panel 上的**独立**分析顾问。\n"
            "下方 JSON 仅包含**事实输入**（行情、技术指标、新闻摘录等），"
            "**不包含**任何主模型或其他模型的评分、操作建议或分析结论。\n"
            "请仅依据这些事实形成**你自己的**判断；不要默认已有结论正确。"
            "若证据相互矛盾，请在分数与表述中如实体现。\n"
            "禁止编造未提供的数据。只输出一个 JSON 对象，字段：\n"
            "sentiment_score (0-100 整数), trend_prediction (字符串), operation_advice (字符串), "
            "confidence (高|中|低), summary (2-3 句), reasoning (1-2 句), "
            "bull_case (1 句：基于事实的最强看多理由), "
            "bear_case (1 句：基于事实的最强看空/风险理由), "
            "dissent_note (1 句：若有人持相反观点，其合理依据是什么)。\n"
        )
    return (
        f"{instructions}\n"
        f"```json\n{json.dumps(facts_brief, ensure_ascii=False, default=str)}\n```"
    )


def format_brief_for_prompt(brief: Dict[str, Any]) -> str:
    """Backward-compatible alias: use facts-only formatting when brief has no primary block."""
    lang = str(brief.get("report_language") or "zh")
    if brief.get("brief_kind") == "audit_with_primary" and brief.get("primary_conclusion"):
        facts = {k: v for k, v in brief.items() if k not in ("primary_model", "primary_conclusion")}
        facts["brief_kind"] = "facts_only"
        return format_consultation_prompt(facts, report_language=lang)
    return format_consultation_prompt(brief, report_language=lang)


def _collect_scores(opinions: List[Dict[str, Any]]) -> List[int]:
    scores: List[int] = []
    for item in opinions:
        if not item.get("success", True):
            continue
        raw = item.get("sentiment_score")
        if isinstance(raw, bool):
            continue
        if isinstance(raw, (int, float)):
            scores.append(int(raw))
    return scores


def compute_opinion_divergence(opinions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Summarize score spread across primary + consultation opinions."""
    scores = _collect_scores(opinions)
    if len(scores) < 2:
        return {
            "score_min": scores[0] if scores else None,
            "score_max": scores[0] if scores else None,
            "score_spread": 0,
            "score_median": scores[0] if scores else None,
            "alignment": "insufficient",
            "alignment_label_zh": "样本不足",
            "alignment_label_en": "Insufficient data",
        }

    score_min = min(scores)
    score_max = max(scores)
    spread = score_max - score_min
    sorted_scores = sorted(scores)
    mid = len(sorted_scores) // 2
    median = (
        sorted_scores[mid]
        if len(sorted_scores) % 2 == 1
        else round((sorted_scores[mid - 1] + sorted_scores[mid]) / 2)
    )

    if spread < 8:
        alignment = "high"
        label_zh = "观点高度一致"
        label_en = "High agreement"
    elif spread < 20:
        alignment = "moderate"
        label_zh = "存在一定分歧"
        label_en = "Moderate divergence"
    else:
        alignment = "low"
        label_zh = "分歧明显"
        label_en = "Significant divergence"

    primary_score = None
    for item in opinions:
        if item.get("role") == "primary":
            raw = item.get("sentiment_score")
            if isinstance(raw, (int, float)) and not isinstance(raw, bool):
                primary_score = int(raw)
            break

    outlier_models: List[str] = []
    if primary_score is not None:
        for item in opinions:
            if item.get("role") != "consultation" or not item.get("success", True):
                continue
            raw = item.get("sentiment_score")
            if isinstance(raw, (int, float)) and not isinstance(raw, bool):
                if abs(int(raw) - primary_score) >= 12:
                    outlier_models.append(str(item.get("model") or ""))

    return {
        "score_min": score_min,
        "score_max": score_max,
        "score_spread": spread,
        "score_median": median,
        "primary_score": primary_score,
        "alignment": alignment,
        "alignment_label_zh": label_zh,
        "alignment_label_en": label_en,
        "outlier_models": [m for m in outlier_models if m],
    }
