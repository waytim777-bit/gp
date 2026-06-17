# -*- coding: utf-8 -*-
"""
预测周期解析（canonical 共享分析去重键）。

周期锚点 cycle_anchor_date = 最新已入库交易日 T（受截止时刻约束）。
预测目标 prediction_target_date = T 的下一交易日。
同一周期窗口：T 日 cutoff → 下一交易日 cutoff 前共用同一份报告。
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional
from zoneinfo import ZoneInfo

from src.core.trading_calendar import (
    MARKET_TIMEZONE,
    add_trading_days,
    get_effective_trading_date,
    get_market_now,
    is_market_open,
)

logger = logging.getLogger(__name__)

DEFAULT_CUTOFF_HOUR = 18


@dataclass(frozen=True)
class PredictionCycle:
    """Resolved prediction cycle for a market at a point in time."""

    market: str
    cycle_anchor_date: date
    prediction_target_date: date
    data_as_of_date: date
    anchor_cutoff_at: datetime
    cycle_ends_at: datetime


def get_prediction_cutoff_hour() -> int:
    raw = os.getenv("PREDICTION_CYCLE_CUTOFF_HOUR", str(DEFAULT_CUTOFF_HOUR))
    try:
        hour = int(raw)
    except ValueError:
        logger.warning("Invalid PREDICTION_CYCLE_CUTOFF_HOUR=%r, using %d", raw, DEFAULT_CUTOFF_HOUR)
        return DEFAULT_CUTOFF_HOUR
    if not 0 <= hour <= 23:
        logger.warning("Invalid PREDICTION_CYCLE_CUTOFF_HOUR=%r, using %d", raw, DEFAULT_CUTOFF_HOUR)
        return DEFAULT_CUTOFF_HOUR
    return hour


def previous_trading_day(market: Optional[str], ref_date: date) -> date:
    """Return the trading session immediately before ref_date."""
    market_key = market or "cn"
    try:
        import exchange_calendars as xcals
        from src.core.trading_calendar import MARKET_EXCHANGE

        ex = MARKET_EXCHANGE.get(market_key)
        if not ex:
            return ref_date
        cal = xcals.get_calendar(ex)
        session = cal.date_to_session(ref_date, direction="previous")
        if cal.is_session(ref_date):
            return cal.previous_session(session).date()
        return session.date()
    except Exception as exc:
        logger.warning("previous_trading_day fail-open: %s", exc)
        return ref_date


def _anchor_cutoff_datetime(anchor: date, market: str, cutoff_hour: int) -> datetime:
    tz_name = MARKET_TIMEZONE.get(market, "Asia/Shanghai")
    tz = ZoneInfo(tz_name)
    return datetime(anchor.year, anchor.month, anchor.day, cutoff_hour, 0, 0, tzinfo=tz)


def resolve_prediction_cycle(
    market: Optional[str],
    current_time: Optional[datetime] = None,
    data_as_of_date: Optional[date] = None,
) -> PredictionCycle:
    """
    Resolve the active prediction cycle for canonical shared analysis.

    ``cycle_anchor_date`` maps to ``shared_analysis_runs.analysis_date``.
    """
    market_key = (market or "cn").lower()
    market_now = get_market_now(market_key, current_time)
    cutoff_hour = get_prediction_cutoff_hour()

    if data_as_of_date is None:
        data_as_of_date = get_effective_trading_date(market_key, market_now)

    anchor = data_as_of_date
    anchor_cutoff = _anchor_cutoff_datetime(anchor, market_key, cutoff_hour)
    if market_now < anchor_cutoff:
        anchor = previous_trading_day(market_key, anchor)
        anchor_cutoff = _anchor_cutoff_datetime(anchor, market_key, cutoff_hour)

    if not is_market_open(market_key, anchor):
        anchor = previous_trading_day(market_key, anchor)
        anchor_cutoff = _anchor_cutoff_datetime(anchor, market_key, cutoff_hour)

    prediction_target = add_trading_days(market_key, anchor, 1)
    cycle_ends_at = _anchor_cutoff_datetime(prediction_target, market_key, cutoff_hour)

    return PredictionCycle(
        market=market_key,
        cycle_anchor_date=anchor,
        prediction_target_date=prediction_target,
        data_as_of_date=data_as_of_date,
        anchor_cutoff_at=anchor_cutoff,
        cycle_ends_at=cycle_ends_at,
    )
