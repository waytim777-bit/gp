# -*- coding: utf-8 -*-
"""Tests for chat routing and report interpretation."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from src.agent.chat_routing import message_implies_incremental, resolve_chat_execution_mode
from src.agent.executor import AgentResult
from src.agent.llm_adapter import LLMResponse
from src.services.report_interpretation_service import ReportInterpretationService


class ChatRoutingTestCase(unittest.TestCase):
    def test_report_interpret_when_record_id_present(self):
        mode = resolve_chat_execution_mode(
            {"record_id": 26, "chat_mode": "report_interpret"},
            "估值是否合理？",
        )
        self.assertEqual(mode, "report_interpret")

    def test_incremental_when_explicit_mode(self):
        mode = resolve_chat_execution_mode(
            {"record_id": 26, "chat_mode": "incremental"},
            "随便问问",
        )
        self.assertEqual(mode, "incremental")

    def test_incremental_when_message_has_keyword(self):
        self.assertTrue(message_implies_incremental("请查最新动态"))
        mode = resolve_chat_execution_mode(
            {"record_id": 26, "chat_mode": "report_interpret"},
            "请补充检索最新新闻",
        )
        self.assertEqual(mode, "incremental")

    def test_agent_without_record_id(self):
        mode = resolve_chat_execution_mode({"stock_code": "600519"}, "分析茅台")
        self.assertEqual(mode, "agent")


class ReportInterpretationServiceTestCase(unittest.TestCase):
    @patch("src.services.report_interpretation_service.MacroFocusBriefService")
    @patch("src.services.report_interpretation_service.conversation_manager")
    @patch("src.services.report_interpretation_service.HistoryService")
    def test_chat_returns_disclaimer_prefixed_answer(self, mock_history_cls, mock_conv, mock_macro_cls):
        mock_macro_cls.get_instance.return_value.get_brief_text.return_value = None
        mock_history_cls.return_value.get_markdown_report.return_value = "# 报告\n买入信号"
        mock_conv.get_or_create.return_value.get_history.return_value = []

        adapter = MagicMock()
        adapter.call_completion.return_value = LLMResponse(
            content="估值偏高，建议观望。",
            model="test-model",
            provider="openai",
            usage={"total_tokens": 42},
        )
        service = ReportInterpretationService(llm_adapter=adapter)

        result = service.chat(
            message="估值是否合理？",
            session_id="sess-1",
            context={
                "record_id": 26,
                "stock_code": "603407",
                "stock_name": "长裕集团",
            },
        )

        self.assertTrue(result.success)
        self.assertIn("#26", result.content)
        self.assertIn("估值偏高", result.content)
        self.assertEqual(result.total_tokens, 42)
        mock_conv.add_message.assert_any_call("sess-1", "user", "估值是否合理？")
        mock_conv.add_message.assert_any_call("sess-1", "assistant", result.content)

    @patch("src.services.report_interpretation_service.MacroFocusBriefService")
    @patch("src.services.report_interpretation_service.conversation_manager")
    @patch("src.services.report_interpretation_service.HistoryService")
    def test_chat_includes_macro_focus_block(self, mock_history_cls, mock_conv, mock_macro_cls):
        mock_macro_cls.get_instance.return_value.get_brief_text.return_value = (
            "【宏观环境 · 新浪焦点】\n共 1 条：\n1. [14:00] 测试焦点"
        )
        mock_history_cls.return_value.get_markdown_report.return_value = "# 报告\n买入信号"
        mock_conv.get_or_create.return_value.get_history.return_value = []

        adapter = MagicMock()
        adapter.call_completion.return_value = LLMResponse(
            content="解读完成。",
            model="test-model",
            provider="openai",
            usage={"total_tokens": 10},
        )
        service = ReportInterpretationService(llm_adapter=adapter)

        result = service.chat(
            message="今天宏观如何？",
            session_id="sess-macro",
            context={"record_id": 26, "stock_code": "603407", "stock_name": "长裕集团"},
        )

        self.assertTrue(result.success)
        prompt_messages = adapter.call_completion.call_args.args[0]
        report_message = next(
            item for item in prompt_messages if item.get("role") == "user" and "分析报告全文" in item.get("content", "")
        )
        self.assertIn("今日宏观环境", report_message["content"])
        self.assertIn("测试焦点", report_message["content"])

    @patch("src.services.report_interpretation_service.HistoryService")
    def test_chat_fails_when_report_missing(self, mock_history_cls):
        mock_history_cls.return_value.get_markdown_report.return_value = ""
        adapter = MagicMock()
        service = ReportInterpretationService(llm_adapter=adapter)

        result = service.chat(
            message="风险有哪些？",
            session_id="sess-2",
            context={"record_id": 99, "stock_code": "603407"},
        )

        self.assertFalse(result.success)
        self.assertIn("内容为空", result.error or "")


if __name__ == "__main__":
    unittest.main()
