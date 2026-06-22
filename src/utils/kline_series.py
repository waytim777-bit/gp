# -*- coding: utf-8 -*-
"""Build normalized daily K-line series payloads for charts and LLM prompts."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Union

import pandas as pd

KLINE_HISTORY_CALENDAR_DAYS = 180
KLINE_SERIES_MAX_BARS = 120
KLINE_BACKFILL_DAYS = 150
WEEKLY_KLINE_MAX_BARS = 52


def _safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if pd.isna(parsed):
        return None
    return parsed


def _normalize_date(value: Any) -> Optional[str]:
    if value is None:
        return None
    try:
        parsed = pd.to_datetime(value)
    except Exception:
        text = str(value).strip()
        return text or None
    if pd.isna(parsed):
        return None
    return parsed.date().isoformat()


def _records_from_bars(historical_bars: Any) -> List[Dict[str, Any]]:
    if historical_bars is None:
        return []
    if isinstance(historical_bars, pd.DataFrame):
        work = historical_bars.copy()
        return work.to_dict(orient="records")
    records: List[Dict[str, Any]] = []
    for bar in historical_bars:
        if isinstance(bar, dict):
            records.append(dict(bar))
        elif hasattr(bar, "to_dict"):
            try:
                records.append(bar.to_dict())
            except Exception:
                continue
    return records


def _prepare_dataframe(records: Sequence[Dict[str, Any]]) -> pd.DataFrame:
    if not records:
        return pd.DataFrame()
    work = pd.DataFrame(list(records))
    if work.empty or "close" not in work.columns:
        return pd.DataFrame()
    if "date" in work.columns:
        work["date"] = pd.to_datetime(work["date"], errors="coerce")
        work = work.dropna(subset=["date"])
        work = work.sort_values("date")
    close = pd.to_numeric(work["close"], errors="coerce")
    work["close"] = close
    for column in ("open", "high", "low", "volume", "amount", "pct_chg"):
        if column in work.columns:
            work[column] = pd.to_numeric(work[column], errors="coerce")
    for period, column in ((5, "ma5"), (10, "ma10"), (20, "ma20")):
        if column not in work.columns or work[column].isna().all():
            work[column] = close.rolling(window=period, min_periods=1).mean()
    return work


def _build_snapshot(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not rows:
        return {}
    closes = [_safe_float(row.get("close")) for row in rows]
    valid_closes = [value for value in closes if value is not None]
    if not valid_closes:
        return {}

    latest_close = valid_closes[-1]
    period_high = max(valid_closes)
    period_low = min(valid_closes)
    high_row = rows[closes.index(period_high)]
    low_row = rows[closes.index(period_low)]

    snapshot: Dict[str, Any] = {
        "latest_close": latest_close,
        "period_high": period_high,
        "period_low": period_low,
        "period_high_date": high_row.get("date"),
        "period_low_date": low_row.get("date"),
    }
    if period_low:
        snapshot["distance_from_low_pct"] = round((latest_close - period_low) / period_low * 100.0, 4)
    if period_high:
        snapshot["distance_from_high_pct"] = round((latest_close - period_high) / period_high * 100.0, 4)

    for window, key in ((20, "change_20d_pct"), (60, "change_60d_pct")):
        if len(valid_closes) > window:
            base = valid_closes[-(window + 1)]
            if base:
                snapshot[key] = round((latest_close - base) / base * 100.0, 4)
    return snapshot


def build_kline_series_payload(
    historical_bars: Any,
    *,
    max_bars: int = KLINE_SERIES_MAX_BARS,
    source: str = "pipeline_daily_bars",
) -> Dict[str, Any]:
    """
    Normalize OHLCV rows for API charts and prompt snapshots.
    """
    records = _records_from_bars(historical_bars)
    work = _prepare_dataframe(records)
    if work.empty:
        return {}

    tail = work.tail(max(1, max_bars))
    rows: List[Dict[str, Any]] = []
    for _, row in tail.iterrows():
        rows.append(
            {
                "date": _normalize_date(row.get("date")),
                "open": _safe_float(row.get("open")),
                "high": _safe_float(row.get("high")),
                "low": _safe_float(row.get("low")),
                "close": _safe_float(row.get("close")),
                "volume": _safe_float(row.get("volume")),
                "ma5": _safe_float(row.get("ma5")),
                "ma10": _safe_float(row.get("ma10")),
                "ma20": _safe_float(row.get("ma20")),
                "pct_chg": _safe_float(row.get("pct_chg")),
            }
        )

    rows = [row for row in rows if row.get("date") and row.get("close") is not None]
    if not rows:
        return {}

    return {
        "source": source,
        "total_records": len(rows),
        "rows": rows,
        "snapshot": _build_snapshot(rows),
    }


def build_kline_series_from_dataframe(
    df: Optional[pd.DataFrame],
    *,
    max_bars: int = KLINE_SERIES_MAX_BARS,
    source: str = "pipeline_daily_bars",
) -> Dict[str, Any]:
    if df is None or df.empty:
        return {}
    return build_kline_series_payload(df, max_bars=max_bars, source=source)


def _resample_to_weekly_dataframe(work: pd.DataFrame) -> pd.DataFrame:
    if work.empty or "date" not in work.columns or "close" not in work.columns:
        return pd.DataFrame()
    weekly = work.set_index("date").resample("W-FRI").agg(
        {
            "open": "first",
            "high": "max",
            "low": "min",
            "close": "last",
            "volume": "sum",
        }
    )
    if "amount" in work.columns:
        weekly["amount"] = work.set_index("date")["amount"].resample("W-FRI").sum()
    weekly = weekly.dropna(subset=["close"]).reset_index()
    close = pd.to_numeric(weekly["close"], errors="coerce")
    weekly["close"] = close
    weekly["pct_chg"] = close.pct_change() * 100.0
    for period, column in ((5, "ma5"), (10, "ma10"), (20, "ma20")):
        weekly[column] = close.rolling(window=period, min_periods=1).mean()
    return weekly


def build_weekly_kline_series_payload(
    historical_bars: Any,
    *,
    max_bars: int = WEEKLY_KLINE_MAX_BARS,
    source: str = "weekly_resample_from_daily",
) -> Dict[str, Any]:
    """
    Resample daily OHLCV bars into weekly series for multi-timeframe charts.
    """
    records = _records_from_bars(historical_bars)
    work = _prepare_dataframe(records)
    if work.empty:
        return {}
    weekly = _resample_to_weekly_dataframe(work)
    if weekly.empty:
        return {}
    payload = build_kline_series_payload(weekly, max_bars=max_bars, source=source)
    if payload:
        payload["timeframe"] = "weekly"
    return payload


def build_weekly_kline_series_from_dataframe(
    df: Optional[pd.DataFrame],
    *,
    max_bars: int = WEEKLY_KLINE_MAX_BARS,
    source: str = "weekly_resample_from_daily",
) -> Dict[str, Any]:
    if df is None or df.empty:
        return {}
    return build_weekly_kline_series_payload(df, max_bars=max_bars, source=source)
