# -*- coding: utf-8 -*-
"""Lightweight Q&A on an existing homepage analysis report (no agent pipeline)."""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, List, Optional

from src.agent.conversation import conversation_manager
from src.agent.executor import AgentResult
from src.agent.llm_adapter import LLMToolAdapter
from src.report_language import normalize_report_language
from src.services.history_service import HistoryService
from src.services.macro_focus_brief_service import MacroFocusBriefService
from src.services.macro_indicators_brief_service import MacroIndicatorsBriefService

logger = logging.getLogger(__name__)

_MAX_REPORT_CHARS = 24_000

_SYSTEM_PROMPT_ZH = """\
你是一位股票投资报告解读助手。用户已完成首页结构化分析，你将基于【已有分析报告全文】回答追问。

## 规则
1. **禁止**大段复述报告原文或重复已知结论；紧扣用户当前问题作答。
2. 可引用报告中的数据、评分与建议，并做对比、延伸或风险提示。
3. 报告未覆盖的内容请明确说明「报告中未涉及」，不要编造数字或新闻。
4. 若用户追问需要实时行情、最新新闻、竞品数据等需重新拉取的信息，说明需使用「查最新动态（增量）」功能。
5. 使用 Markdown，结构清晰，语气专业、务实。
"""

_SYSTEM_PROMPT_EN = """\
You are a stock report interpretation assistant. The user already has a homepage \
analysis report; answer follow-up questions using the report body provided.

Rules:
1. Do not repeat large chunks of the report; answer the user's actual question.
2. Cite report data and conclusions when helpful; highlight gaps or contradictions.
3. Say clearly when the report does not cover a topic; never invent numbers or news.
4. If the user needs live quotes, fresh news, or peer comparison, suggest using \
incremental deep-dive instead.
5. Use Markdown; be concise and professional.
"""


def _build_system_prompt(report_language: str) -> str:
    if normalize_report_language(report_language) == "en":
        return _SYSTEM_PROMPT_EN
    return _SYSTEM_PROMPT_ZH


def _truncate_report(markdown: str, *, limit: int = _MAX_REPORT_CHARS) -> str:
    text = (markdown or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit] + "\n\n...(报告已截断，仅保留前段内容供解读)..."


def _build_disclaimer(
    *,
    record_id: int,
    stock_name: str,
    stock_code: str,
    report_language: str,
) -> str:
    display = f"{stock_name}({stock_code})" if stock_name else stock_code
    if normalize_report_language(report_language) == "en":
        return (
            f"> Interpretation based on your homepage report #{record_id} for "
            f"{display}. This is follow-up Q&A, not a full re-analysis. "
            f"Use **Latest updates (incremental)** to refresh market data.\n\n"
        )
    return (
        f"> 以下解读基于您首页分析报告（#{record_id} · {display}），"
        f"侧重追问作答，**不会**重新跑完整分析。"
        f"如需刷新行情/新闻，请使用「查最新动态（增量）」。\n\n"
    )


class ReportInterpretationService:
    """Answer follow-up questions using persisted report markdown only."""

    def __init__(self, llm_adapter: Optional[LLMToolAdapter] = None):
        self._llm_adapter = llm_adapter

    def _get_llm_adapter(self) -> LLMToolAdapter:
        if self._llm_adapter is None:
            from src.config import get_config

            self._llm_adapter = LLMToolAdapter(get_config())
        return self._llm_adapter

    def chat(
        self,
        *,
        message: str,
        session_id: str,
        context: Dict[str, Any],
        progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    ) -> AgentResult:
        record_id = context.get("record_id")
        try:
            rid = int(record_id)
        except (TypeError, ValueError):
            return AgentResult(success=False, error="report_interpret 需要有效的 record_id")

        if progress_callback:
            progress_callback({"type": "thinking", "message": "正在解读已有分析报告..."})

        report_language = normalize_report_language(context.get("report_language", "zh"))
        stock_code = str(context.get("stock_code") or "")
        stock_name = str(context.get("stock_name") or "")

        try:
            markdown = HistoryService().get_markdown_report(str(rid))
        except Exception as exc:
            logger.error("report_interpret: failed to load markdown for %s: %s", rid, exc)
            return AgentResult(success=False, error=f"无法加载分析报告 #{rid}")

        if not isinstance(markdown, str) or not markdown.strip():
            return AgentResult(success=False, error=f"分析报告 #{rid} 内容为空")

        report_body = _truncate_report(markdown)
        system_prompt = _build_system_prompt(report_language)
        macro_brief = MacroFocusBriefService.get_instance().get_brief_text()
        indicators_brief = MacroIndicatorsBriefService.get_instance().get_brief_text()
        macro_block = ""
        if indicators_brief or macro_brief:
            parts: List[str] = []
            if indicators_brief:
                parts.append(
                    f"### 结构化宏观指标\n\n{indicators_brief}"
                    if report_language != "en"
                    else f"### Structured macro indicators\n\n{indicators_brief}"
                )
            if macro_brief:
                parts.append(
                    f"### 新浪焦点快讯\n\n{macro_brief}"
                    if report_language != "en"
                    else f"### Sina focus headlines\n\n{macro_brief}"
                )
            section_title = (
                "## 今日宏观环境（全站共享）\n\n"
                if report_language != "en"
                else "## Today's macro environment (shared)\n\n"
            )
            macro_block = section_title + "\n\n".join(parts) + "\n\n"
        report_block = (
            f"{macro_block}## 分析报告全文（record_id={rid}）\n\n{report_body}"
            if report_language != "en"
            else f"{macro_block}## Full analysis report (record_id={rid})\n\n{report_body}"
        )

        session = conversation_manager.get_or_create(session_id)
        history = session.get_history()
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": report_block},
            {
                "role": "assistant",
                "content": (
                    "已阅读该分析报告，请提出您的追问。"
                    if report_language != "en"
                    else "I have read the report. Please ask your follow-up question."
                ),
            },
        ]
        for item in history:
            role = item.get("role")
            content = item.get("content")
            if role in ("user", "assistant") and isinstance(content, str) and content.strip():
                messages.append({"role": role, "content": content.strip()})

        user_message = (message or "").strip()
        if not user_message:
            return AgentResult(success=False, error="消息不能为空")

        messages.append({"role": "user", "content": user_message})
        conversation_manager.add_message(session_id, "user", user_message)

        if progress_callback:
            progress_callback({"type": "generating", "message": "正在生成追问解读..."})

        adapter = self._get_llm_adapter()
        response = adapter.call_completion(messages, temperature=0.4, max_tokens=4096)
        content = (response.content or "").strip()
        if not content or response.provider == "error":
            error = content or "报告解读 LLM 调用失败"
            conversation_manager.add_message(session_id, "assistant", f"[解读失败] {error}")
            return AgentResult(success=False, error=error, model=response.model, provider=response.provider)

        disclaimer = _build_disclaimer(
            record_id=rid,
            stock_name=stock_name,
            stock_code=stock_code,
            report_language=report_language,
        )
        final_content = disclaimer + content
        conversation_manager.add_message(session_id, "assistant", final_content)

        tokens = 0
        if isinstance(response.usage, dict):
            tokens = int(response.usage.get("total_tokens") or 0)

        return AgentResult(
            success=True,
            content=final_content,
            total_steps=1,
            total_tokens=tokens,
            model=response.model,
            provider=response.provider,
        )
