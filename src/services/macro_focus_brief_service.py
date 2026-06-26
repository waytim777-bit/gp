# -*- coding: utf-8 -*-
"""Shared macro brief from locally generated Sina focus news JSON."""

from __future__ import annotations

import json
import logging
import re
import threading
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from src.config import get_config

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_TIMEZONE = "Asia/Shanghai"
_DEFAULT_FILE_TEMPLATE = "focus/tushare_focus_news_{date}.json"
_MACRO_BRIEF_HEADER = "【宏观环境 · 新浪焦点】"
_MACRO_BLOCK_RE = re.compile(
    rf"{re.escape(_MACRO_BRIEF_HEADER)}.*?(?=\n\n【|$)",
    re.DOTALL,
)
_TITLE_MAX_CHARS = 120
_HARD_MAX_ITEMS = 200


@dataclass
class MacroFocusItem:
    datetime: str
    title: str

    def to_line(self, index: int) -> str:
        title = (self.title or "").strip()
        if len(title) > _TITLE_MAX_CHARS:
            title = title[:_TITLE_MAX_CHARS] + "…"
        time_label = (self.datetime or "").strip()
        return f"{index}. [{time_label}] {title}"


class MacroFocusBriefService:
    """Load focus headlines from ``focus/tushare_focus_news_{date}.json``."""

    _instance: Optional["MacroFocusBriefService"] = None
    _instance_lock = threading.Lock()

    def __init__(self) -> None:
        config = get_config()
        self._enabled = bool(getattr(config, "macro_focus_brief_enabled", True))
        self._ttl_seconds = float(getattr(config, "macro_focus_brief_ttl_seconds", 1800) or 1800)
        # 0 = no soft cap (push all items in the file)
        self._max_items = int(getattr(config, "macro_focus_brief_max_items", 0) or 0)
        self._file_template = (
            str(getattr(config, "macro_focus_brief_file", _DEFAULT_FILE_TEMPLATE) or "")
            .strip()
            or _DEFAULT_FILE_TEMPLATE
        )
        self._cache_lock = threading.Lock()
        self._cache_expires_at: float = 0.0
        self._cache_payload: Optional[Dict[str, Any]] = None

    @classmethod
    def get_instance(cls) -> "MacroFocusBriefService":
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @classmethod
    def reset_instance_for_tests(cls) -> None:
        with cls._instance_lock:
            cls._instance = None

    def is_enabled(self) -> bool:
        return bool(self._enabled)

    def get_brief_text(self, *, force_refresh: bool = False) -> Optional[str]:
        payload = self.get_brief_payload(force_refresh=force_refresh)
        if not payload:
            return None
        return str(payload.get("text") or "").strip() or None

    def get_brief_payload(self, *, force_refresh: bool = False) -> Optional[Dict[str, Any]]:
        if not self.is_enabled():
            return None
        now_ts = datetime.now().timestamp()
        with self._cache_lock:
            if (
                not force_refresh
                and self._cache_payload is not None
                and now_ts < self._cache_expires_at
            ):
                return dict(self._cache_payload)

        try:
            items, source_path, file_mtime = self._load_focus_items_from_file()
            if source_path is None:
                return None
            fetched_at = file_mtime or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            text = self._format_brief(items, fetched_at=fetched_at, source_path=source_path)
            payload = {
                "text": text,
                "items": [item.__dict__ for item in items],
                "fetchedAt": fetched_at,
                "source": f"file:{source_path.as_posix()}",
                "itemCount": len(items),
            }
            with self._cache_lock:
                self._cache_payload = payload
                self._cache_expires_at = now_ts + max(60.0, self._ttl_seconds)
            return dict(payload)
        except Exception as exc:
            logger.warning("[MacroFocusBrief] load failed: %s", exc)
            with self._cache_lock:
                if self._cache_payload is not None:
                    return dict(self._cache_payload)
            return None

    def _resolve_focus_file_path(self) -> Path:
        tz = ZoneInfo(_DEFAULT_TIMEZONE)
        today = datetime.now(tz).strftime("%Y%m%d")
        relative = self._file_template.replace("{date}", today)
        path = Path(relative)
        if not path.is_absolute():
            path = _REPO_ROOT / path
        return path

    def _load_focus_items_from_file(self) -> tuple[List[MacroFocusItem], Optional[Path], Optional[str]]:
        path = self._resolve_focus_file_path()
        if not path.is_file():
            # If the expected daily JSON is missing, simply skip focus injection.
            # This is a normal situation (e.g., the external generator hasn't run yet).
            logger.debug("[MacroFocusBrief] focus file not found: %s", path)
            return [], None, None

        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)

        rows = data.get("news") if isinstance(data, dict) else None
        if not isinstance(rows, list):
            logger.warning("[MacroFocusBrief] invalid focus file format (missing news list): %s", path)
            return [], path, None

        items: List[MacroFocusItem] = []
        seen_titles: set[str] = set()
        soft_limit = self._max_items if self._max_items > 0 else _HARD_MAX_ITEMS
        for row in rows:
            if not isinstance(row, dict):
                continue
            title = str(row.get("content") or row.get("title") or "").strip()
            if not title:
                continue
            normalized_title = re.sub(r"\s+", " ", title)
            if normalized_title in seen_titles:
                continue
            seen_titles.add(normalized_title)
            items.append(
                MacroFocusItem(
                    datetime=str(row.get("datetime") or "").strip(),
                    title=normalized_title,
                )
            )
            if len(items) >= soft_limit:
                if self._max_items <= 0 and len(items) >= _HARD_MAX_ITEMS:
                    logger.warning(
                        "[MacroFocusBrief] hit hard cap %s items for focus feed",
                        _HARD_MAX_ITEMS,
                    )
                break

        file_mtime = datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")
        return items, path, file_mtime

    def _format_brief(
        self,
        items: List[MacroFocusItem],
        *,
        fetched_at: str,
        source_path: Path,
    ) -> str:
        lines = [
            _MACRO_BRIEF_HEADER,
            f"更新时间：{fetched_at}（文件 {source_path.name}，全站共享缓存）",
        ]
        if not items:
            lines.append("（焦点文件暂无要闻）")
            return "\n".join(lines)
        lines.append(f"共 {len(items)} 条：")
        for index, item in enumerate(items, start=1):
            lines.append(item.to_line(index))
        return "\n".join(lines)


def prepend_macro_focus_brief(news_context: Optional[str]) -> Optional[str]:
    """Prepend or refresh shared macro focus brief in a news context string."""
    brief = MacroFocusBriefService.get_instance().get_brief_text()
    if not brief:
        return news_context
    base = _MACRO_BLOCK_RE.sub("", news_context or "").strip()
    if base:
        return f"{brief}\n\n{base}"
    return brief


def ensure_macro_focus_in_agent_context(context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Ensure agent/chat context carries the latest shared macro environment brief."""
    from src.services.macro_indicators_brief_service import prepend_macro_environment_brief

    if not isinstance(context, dict):
        out: Dict[str, Any] = {}
    else:
        out = dict(context)
    existing = out.get("news_context")
    existing_text = existing if isinstance(existing, str) else None
    # Order matters: prepend focus headlines first, then structured macro indicators,
    # so the overall context begins with the most time-sensitive items.
    updated = prepend_macro_focus_brief(existing_text)
    updated = prepend_macro_environment_brief(updated)
    if updated:
        out["news_context"] = updated
    return out
