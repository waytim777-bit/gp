# -*- coding: utf-8 -*-
"""Structured macro indicators brief (cn_m / cn_gdp / us_trycr) with shared cache."""

from __future__ import annotations

import logging
import re
import threading
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

import pandas as pd

from src.config import get_config

logger = logging.getLogger(__name__)

_MACRO_INDICATORS_HEADER = "【宏观环境 · 结构化指标】"
_INDICATORS_BLOCK_RE = re.compile(
    rf"{re.escape(_MACRO_INDICATORS_HEADER)}.*?(?=\n\n【|$)",
    re.DOTALL,
)
_US_LOOKBACK_CALENDAR_DAYS = 35


def _safe_float(value: Any) -> Optional[float]:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _format_pct(value: Optional[float], *, signed: bool = True) -> str:
    if value is None:
        return "—"
    text = f"{value:.2f}%"
    if signed and value > 0:
        return f"+{text}"
    return text


class MacroIndicatorsBriefService:
    """Fetch Tushare macro series and format a compact shared brief."""

    _instance: Optional["MacroIndicatorsBriefService"] = None
    _instance_lock = threading.Lock()

    def __init__(self) -> None:
        config = get_config()
        self._enabled = bool(getattr(config, "macro_indicators_brief_enabled", True))
        self._ttl_seconds = float(getattr(config, "macro_indicators_brief_ttl_seconds", 3600) or 3600)
        self._include_cn_m = bool(getattr(config, "macro_indicators_brief_include_cn_m", True))
        self._include_cn_gdp = bool(getattr(config, "macro_indicators_brief_include_cn_gdp", True))
        self._include_us_trycr = bool(getattr(config, "macro_indicators_brief_include_us_trycr", True))
        self._cache_lock = threading.Lock()
        self._cache_expires_at: float = 0.0
        self._cache_payload: Optional[Dict[str, Any]] = None

    @classmethod
    def get_instance(cls) -> "MacroIndicatorsBriefService":
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
        if not self._enabled:
            return False
        return bool(get_config().tushare_token)

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
            lines = self._build_indicator_lines()
            fetched_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            text = self._format_brief(lines, fetched_at=fetched_at)
            payload = {
                "text": text,
                "lines": lines,
                "fetchedAt": fetched_at,
                "source": "tushare:cn_m,cn_gdp,us_trycr",
                "lineCount": len(lines),
            }
            with self._cache_lock:
                self._cache_payload = payload
                self._cache_expires_at = now_ts + max(300.0, self._ttl_seconds)
            return dict(payload)
        except Exception as exc:
            logger.warning("[MacroIndicatorsBrief] fetch failed: %s", exc)
            with self._cache_lock:
                if self._cache_payload is not None:
                    return dict(self._cache_payload)
            return None

    def _build_indicator_lines(self) -> List[str]:
        client = self._build_client()
        if client is None:
            return []

        lines: List[str] = []
        if self._include_cn_m:
            line = self._fetch_cn_m_line(client)
            if line:
                lines.append(line)
        if self._include_cn_gdp:
            line = self._fetch_cn_gdp_line(client)
            if line:
                lines.append(line)
        if self._include_us_trycr:
            line = self._fetch_us_trycr_line(client)
            if line:
                lines.append(line)
        return lines

    @staticmethod
    def _build_client():
        from data_provider.tushare_fetcher import _TushareHttpClient

        token = (get_config().tushare_token or "").strip()
        if not token:
            return None
        return _TushareHttpClient(token=token)

    def _fetch_cn_m_line(self, client) -> Optional[str]:
        try:
            end_month = date.today().strftime("%Y%m")
            start_month = (date.today().replace(day=1) - timedelta(days=400)).strftime("%Y%m")
            df = client.query(
                "cn_m",
                fields="month,m1,m1_yoy,m2,m2_yoy",
                start_m=start_month,
                end_m=end_month,
            )
            if df is None or df.empty:
                return None
            df = df.sort_values("month", ascending=False)
            latest = df.iloc[0]
            month = str(latest.get("month") or "").strip()
            m1_yoy = _safe_float(latest.get("m1_yoy"))
            m2_yoy = _safe_float(latest.get("m2_yoy"))
            spread = None
            if m1_yoy is not None and m2_yoy is not None:
                spread = m1_yoy - m2_yoy
            spread_text = _format_pct(spread, signed=True)
            return (
                f"货币供应（{month}）：M1同比 {_format_pct(m1_yoy)}，"
                f"M2同比 {_format_pct(m2_yoy)}，M1-M2剪刀差 {spread_text}"
            )
        except Exception as exc:
            logger.info("[MacroIndicatorsBrief] cn_m unavailable: %s", exc)
            return None

    def _fetch_cn_gdp_line(self, client) -> Optional[str]:
        try:
            df = client.query(
                "cn_gdp",
                fields="quarter,gdp_yoy,pi_yoy,si_yoy,ti_yoy",
                start_q="2018Q1",
            )
            if df is None or df.empty:
                return None
            df = df.sort_values("quarter", ascending=False)
            latest = df.iloc[0]
            quarter = str(latest.get("quarter") or "").strip()
            gdp_yoy = _safe_float(latest.get("gdp_yoy"))
            pi_yoy = _safe_float(latest.get("pi_yoy"))
            si_yoy = _safe_float(latest.get("si_yoy"))
            ti_yoy = _safe_float(latest.get("ti_yoy"))
            return (
                f"GDP（{quarter}）：当季同比 {_format_pct(gdp_yoy)}；"
                f"一产 {_format_pct(pi_yoy)} / 二产 {_format_pct(si_yoy)} / 三产 {_format_pct(ti_yoy)}"
            )
        except Exception as exc:
            logger.info("[MacroIndicatorsBrief] cn_gdp unavailable: %s", exc)
            return None

    def _fetch_us_trycr_line(self, client) -> Optional[str]:
        try:
            end_dt = date.today()
            start_dt = end_dt - timedelta(days=_US_LOOKBACK_CALENDAR_DAYS)
            df = client.query(
                "us_trycr",
                fields="date,y10",
                start_date=start_dt.strftime("%Y%m%d"),
                end_date=end_dt.strftime("%Y%m%d"),
            )
            if df is None or df.empty:
                return None
            df = df.dropna(subset=["date"]).sort_values("date", ascending=False)
            latest = df.iloc[0]
            latest_date = str(latest.get("date") or "").strip()
            latest_y10 = _safe_float(latest.get("y10"))

            change_bps: Optional[float] = None
            if len(df) >= 2:
                oldest = df.iloc[-1]
                oldest_y10 = _safe_float(oldest.get("y10"))
                if latest_y10 is not None and oldest_y10 is not None:
                    change_bps = (latest_y10 - oldest_y10) * 100.0

            y10_text = "—" if latest_y10 is None else f"{latest_y10:.2f}%"
            if change_bps is None:
                change_text = "—"
            else:
                change_text = f"{change_bps:+.0f}bp（近窗）"
            return f"美债实际收益率（{latest_date}）：10年期 {y10_text}，较窗初 {change_text}"
        except Exception as exc:
            logger.info("[MacroIndicatorsBrief] us_trycr unavailable: %s", exc)
            return None

    def _format_brief(self, lines: List[str], *, fetched_at: str) -> str:
        header = [
            _MACRO_INDICATORS_HEADER,
            f"更新时间：{fetched_at}（全站共享缓存；数据滞后请以官方发布为准）",
        ]
        if not lines:
            header.append("（结构化宏观指标暂不可用，可能为积分/权限不足或接口异常）")
            return "\n".join(header)
        header.extend(lines)
        header.append("注：以上为宏观背景，不直接等同于个股走势预测。")
        return "\n".join(header)


def prepend_macro_indicators_brief(news_context: Optional[str]) -> Optional[str]:
    """Prepend or refresh structured macro indicators in a news context string."""
    brief = MacroIndicatorsBriefService.get_instance().get_brief_text()
    if not brief:
        return news_context
    base = _INDICATORS_BLOCK_RE.sub("", news_context or "").strip()
    if base:
        return f"{brief}\n\n{base}"
    return brief


def prepend_macro_environment_brief(news_context: Optional[str]) -> Optional[str]:
    """Prepend focus headlines (layer 1) then structured indicators sit below them."""
    from src.services.macro_focus_brief_service import prepend_macro_focus_brief

    merged = prepend_macro_indicators_brief(news_context)
    return prepend_macro_focus_brief(merged)
