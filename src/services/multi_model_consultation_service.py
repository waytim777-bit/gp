# -*- coding: utf-8 -*-
"""Read-only multi-model consultation after primary Agent analysis."""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional

from src.agent.llm_adapter import LLMToolAdapter
from src.agent.runner import try_parse_json
from src.config import Config, get_effective_agent_primary_model, get_effective_consultation_models
from src.report_language import normalize_report_language
from src.services.analysis_brief import (
    build_analysis_brief,
    build_consultation_facts_brief,
    compute_opinion_divergence,
    format_consultation_prompt,
)
from src.storage import persist_llm_usage

logger = logging.getLogger(__name__)

_CONSULT_SYSTEM_ZH = (
    "你是独立的 A 股/港股/美股分析顾问。"
    "只能依据用户提供的分析摘要做判断，禁止编造未提供的数据。"
    "只输出 JSON，不要 markdown 代码块。"
)
_CONSULT_SYSTEM_EN = (
    "You are an independent equity analyst."
    "Use only the provided brief; do not fabricate data."
    "Return JSON only, no markdown fences."
)


class MultiModelConsultationService:
    def __init__(self, config: Optional[Config] = None):
        from src.config import get_config

        self.config = config or get_config()

    def is_enabled(self) -> bool:
        return bool(get_effective_consultation_models(self.config))

    def run(
        self,
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
        report_language: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Run primary snapshot + parallel read-only consultations."""
        lang = normalize_report_language(
            report_language
            or context.get("report_language")
            or getattr(self.config, "report_language", "zh")
        )
        primary = primary_model or get_effective_agent_primary_model(self.config)
        facts_brief = build_consultation_facts_brief(
            stock_code=stock_code,
            stock_name=stock_name,
            context=context,
            report_language=lang,
        )
        audit_brief = build_analysis_brief(
            stock_code=stock_code,
            stock_name=stock_name,
            context=context,
            sentiment_score=sentiment_score,
            operation_advice=operation_advice,
            trend_prediction=trend_prediction,
            analysis_summary=analysis_summary,
            dashboard=dashboard,
            primary_model=primary,
            report_language=lang,
        )

        opinions: List[Dict[str, Any]] = [
            self._primary_opinion(
                model=primary,
                sentiment_score=sentiment_score,
                operation_advice=operation_advice,
                trend_prediction=trend_prediction,
                analysis_summary=analysis_summary,
                dashboard=dashboard,
            )
        ]

        consult_models = get_effective_consultation_models(self.config)
        if consult_models:
            with ThreadPoolExecutor(max_workers=min(4, len(consult_models))) as pool:
                futures = {
                    pool.submit(
                        self._consult_one,
                        model_name,
                        facts_brief,
                        lang,
                        stock_code,
                    ): model_name
                    for model_name in consult_models
                }
                for future in as_completed(futures):
                    model_name = futures[future]
                    try:
                        opinions.append(future.result())
                    except Exception as exc:
                        logger.warning(
                            "[MultiModelConsult] model=%s failed: %s",
                            model_name,
                            exc,
                        )
                        opinions.append(self._failed_opinion(model_name, str(exc)))

        divergence = compute_opinion_divergence(opinions)

        return {
            "brief_version": facts_brief.get("version", 2),
            "brief_kind": "facts_only",
            "primary_model": primary,
            "report_language": lang,
            "facts_brief": facts_brief,
            "audit_brief": audit_brief,
            "divergence": divergence,
            "opinions": opinions,
        }

    @staticmethod
    def _primary_opinion(
        *,
        model: str,
        sentiment_score: Optional[int],
        operation_advice: Optional[str],
        trend_prediction: Optional[str],
        analysis_summary: Optional[str],
        dashboard: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        dash = dashboard if isinstance(dashboard, dict) else {}
        core = (dash.get("dashboard") or {}).get("core_conclusion") or {}
        return {
            "role": "primary",
            "model": model,
            "success": True,
            "sentiment_score": sentiment_score,
            "operation_advice": operation_advice,
            "trend_prediction": trend_prediction,
            "confidence": dash.get("confidence_level") or dash.get("confidence"),
            "summary": analysis_summary or (core.get("one_sentence") if isinstance(core, dict) else None),
            "reasoning": dash.get("buy_reason") or analysis_summary,
            "total_tokens": 0,
        }

    def _consult_one(
        self,
        model_name: str,
        brief: Dict[str, Any],
        report_language: str,
        stock_code: str,
    ) -> Dict[str, Any]:
        adapter = LLMToolAdapter(self.config, model_override=model_name)
        system = _CONSULT_SYSTEM_EN if report_language == "en" else _CONSULT_SYSTEM_ZH
        user_content = format_consultation_prompt(brief, report_language=report_language)
        response = adapter.call_text(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
            ],
            max_tokens=2048,
            timeout=120,
        )
        usage = response.usage or {}
        model_used = getattr(response, "model", None) or model_name
        if usage.get("total_tokens", 0) > 0:
            persist_llm_usage(
                usage,
                model_used,
                call_type="consultation",
                stock_code=stock_code,
            )

        if not (response.content or "").strip():
            return self._failed_opinion(model_name, response.content or "empty response")

        parsed = try_parse_json(response.content)
        if not isinstance(parsed, dict):
            return self._failed_opinion(model_name, "failed to parse consultation JSON")

        return {
            "role": "consultation",
            "model": model_used,
            "success": True,
            "sentiment_score": parsed.get("sentiment_score"),
            "operation_advice": parsed.get("operation_advice"),
            "trend_prediction": parsed.get("trend_prediction"),
            "confidence": parsed.get("confidence"),
            "summary": parsed.get("summary"),
            "reasoning": parsed.get("reasoning"),
            "bull_case": parsed.get("bull_case"),
            "bear_case": parsed.get("bear_case"),
            "dissent_note": parsed.get("dissent_note"),
            "total_tokens": usage.get("total_tokens", 0) or 0,
        }

    @staticmethod
    def _failed_opinion(model: str, error: str) -> Dict[str, Any]:
        return {
            "role": "consultation",
            "model": model,
            "success": False,
            "error": error,
            "total_tokens": 0,
        }
