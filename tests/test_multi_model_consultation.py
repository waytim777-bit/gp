# -*- coding: utf-8 -*-
"""Tests for analysis brief and multi-model consultation."""

import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.agent.llm_adapter import LLMResponse
from src.config import Config, get_effective_consultation_models
from src.services.analysis_brief import (
    build_analysis_brief,
    build_consultation_facts_brief,
    compute_opinion_divergence,
    format_brief_for_prompt,
    format_consultation_prompt,
)
from src.services.multi_model_consultation_service import MultiModelConsultationService


class AnalysisBriefTestCase(unittest.TestCase):
    def test_build_analysis_brief_includes_primary_and_news(self) -> None:
        brief = build_analysis_brief(
            stock_code="601318",
            stock_name="中国平安",
            context={
                "realtime_quote": {"price": 52.0, "change_pct": -1.2},
                "trend_result": {"ma5": 53.0},
                "news_context": "业绩稳健",
                "capital_flow": {"main_net_inflow": 1000},
            },
            sentiment_score=55,
            operation_advice="观望",
            trend_prediction="震荡",
            analysis_summary="短期承压",
            primary_model="openai/deepseek-v3.2",
        )
        self.assertEqual(brief["stock_code"], "601318")
        self.assertEqual(brief["primary_conclusion"]["sentiment_score"], 55)
        self.assertIn("业绩稳健", brief["news_excerpt"])
        prompt = format_brief_for_prompt(brief)
        self.assertIn("601318", prompt)
        self.assertNotIn("短期承压", prompt)
        self.assertNotIn("primary_conclusion", prompt)

    def test_consultation_facts_brief_excludes_primary(self) -> None:
        facts = build_consultation_facts_brief(
            stock_code="600731",
            stock_name="湖南海利",
            context={
                "realtime_quote": {"price": 5.4},
                "trend_result": {"ma5": 5.5},
                "news_context": "行业新闻",
            },
        )
        self.assertEqual(facts["brief_kind"], "facts_only")
        self.assertNotIn("primary_conclusion", facts)
        prompt = format_consultation_prompt(facts, report_language="zh")
        self.assertIn("不包含", prompt)
        self.assertIn("行业新闻", prompt)
        self.assertIn("bull_case", prompt)
        self.assertIn("dissent_note", prompt)

    def test_compute_opinion_divergence_spread(self) -> None:
        opinions = [
            {"role": "primary", "success": True, "sentiment_score": 54, "model": "deepseek"},
            {"role": "consultation", "success": True, "sentiment_score": 72, "model": "gpt"},
            {"role": "consultation", "success": True, "sentiment_score": 48, "model": "qwen"},
        ]
        div = compute_opinion_divergence(opinions)
        self.assertEqual(div["score_spread"], 24)
        self.assertEqual(div["alignment"], "low")
        self.assertIn("gpt", div["outlier_models"])


class ConsultationModelsTestCase(unittest.TestCase):
    def test_excludes_primary_model(self) -> None:
        config = Config(
            multi_model_panel_enabled=True,
            multi_model_panel_models=["openai/deepseek-v3.2", "openai/gpt-5.4-nano"],
            agent_litellm_model="openai/deepseek-v3.2",
            llm_model_list=[
                {"litellm_params": {"model": "openai/deepseek-v3.2"}},
                {"litellm_params": {"model": "openai/gpt-5.4-nano"}},
            ],
        )
        models = get_effective_consultation_models(config)
        self.assertEqual(models, ["openai/gpt-5.4-nano"])


class MultiModelConsultationServiceTestCase(unittest.TestCase):
    @patch("src.services.multi_model_consultation_service.LLMToolAdapter")
    @patch("src.services.multi_model_consultation_service.persist_llm_usage")
    def test_run_returns_primary_and_consultation(self, _persist, mock_adapter_cls) -> None:
        adapter = MagicMock()
        adapter.call_text.return_value = LLMResponse(
            content=(
                '{"sentiment_score": 60, "operation_advice": "持有", "trend_prediction": "震荡", '
                '"confidence": "中", "summary": "中性", "reasoning": "依据brief", '
                '"bull_case": "估值合理", "bear_case": "宏观承压", "dissent_note": "也可看空"}'
            ),
            usage={"total_tokens": 500},
            model="openai/gpt-5.4-nano",
        )
        mock_adapter_cls.return_value = adapter

        config = Config(
            multi_model_panel_enabled=True,
            multi_model_panel_models=["openai/gpt-5.4-nano"],
            agent_litellm_model="openai/deepseek-v3.2",
        )
        service = MultiModelConsultationService(config)
        payload = service.run(
            stock_code="601318",
            stock_name="中国平安",
            context={"realtime_quote": {"price": 52.0}, "news_context": "test"},
            sentiment_score=55,
            operation_advice="观望",
            trend_prediction="震荡",
            analysis_summary="主结论",
        )
        self.assertEqual(len(payload["opinions"]), 2)
        self.assertEqual(payload["opinions"][0]["role"], "primary")
        self.assertEqual(payload["opinions"][1]["role"], "consultation")
        self.assertEqual(payload["opinions"][1]["operation_advice"], "持有")
        self.assertEqual(payload["opinions"][1]["bull_case"], "估值合理")
        self.assertEqual(payload["brief_kind"], "facts_only")
        self.assertIn("divergence", payload)
        self.assertIn("facts_brief", payload)
        call_args = adapter.call_text.call_args[0][0]
        user_msg = call_args[1]["content"]
        self.assertNotIn("主结论", user_msg)
        self.assertNotIn("primary_conclusion", user_msg)


if __name__ == "__main__":
    unittest.main()
