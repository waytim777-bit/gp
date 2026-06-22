# -*- coding: utf-8 -*-
"""Build AnalysisReport payloads from history records."""

from __future__ import annotations

from typing import Any, Dict, TYPE_CHECKING

from src.report_language import (
    get_localized_stock_name,
    get_sentiment_label,
    localize_operation_advice,
    localize_trend_prediction,
    normalize_report_language,
)
from src.storage import DatabaseManager
from src.utils.data_processing import (
    extract_board_detail_fields,
    extract_company_profile_detail_field,
    extract_fundamental_detail_fields,
    extract_technical_detail_fields,
    normalize_model_used,
)

if TYPE_CHECKING:
    from api.v1.schemas.history import AnalysisReport
    from src.storage import DatabaseManager


def build_analysis_report(
    result: Dict[str, Any],
    db_manager: "DatabaseManager",
    *,
    owner_user_id: int | None = None,
) -> "AnalysisReport":
    """Convert a history detail dict into an AnalysisReport response model."""
    from api.v1.schemas.history import (
        AnalysisReport,
        PredictionCycleMeta,
        ReportDetails,
        ReportMeta,
        ReportStrategy,
        ReportSummary,
    )

    current_price = None
    change_pct = None
    context_snapshot = result.get("context_snapshot")
    if context_snapshot and isinstance(context_snapshot, dict):
        enhanced_context = context_snapshot.get("enhanced_context") or {}
        realtime = enhanced_context.get("realtime") or {}
        current_price = realtime.get("price")
        change_pct = realtime.get("change_pct") or realtime.get("change_60d")

        if current_price is None:
            realtime_quote_raw = context_snapshot.get("realtime_quote_raw") or {}
            current_price = realtime_quote_raw.get("price")
            change_pct = change_pct or realtime_quote_raw.get("change_pct") or realtime_quote_raw.get("pct_chg")

    raw_result = result.get("raw_result")
    if not isinstance(raw_result, dict):
        raw_result = {}
    report_language = normalize_report_language(
        result.get("report_language")
        or raw_result.get("report_language")
        or (
            context_snapshot.get("report_language")
            if isinstance(context_snapshot, dict)
            else None
        )
    )
    stock_name = get_localized_stock_name(
        result.get("stock_name"),
        result.get("stock_code", ""),
        report_language,
    )

    cycle_raw = result.get("prediction_cycle")
    cycle_meta = PredictionCycleMeta(**cycle_raw) if isinstance(cycle_raw, dict) else None
    meta = ReportMeta(
        id=result.get("id"),
        query_id=result.get("query_id", ""),
        stock_code=result.get("stock_code", ""),
        stock_name=stock_name,
        report_type=result.get("report_type"),
        report_language=report_language,
        created_at=result.get("created_at"),
        current_price=current_price,
        change_pct=change_pct,
        model_used=normalize_model_used(result.get("model_used")),
        prediction_cycle=cycle_meta,
    )

    summary = ReportSummary(
        analysis_summary=result.get("analysis_summary"),
        operation_advice=localize_operation_advice(
            result.get("operation_advice"),
            report_language,
        ),
        trend_prediction=localize_trend_prediction(
            result.get("trend_prediction"),
            report_language,
        ),
        sentiment_score=result.get("sentiment_score"),
        sentiment_label=(
            get_sentiment_label(result.get("sentiment_score"), report_language)
            if result.get("sentiment_score") is not None
            else result.get("sentiment_label")
        ),
    )

    strategy = ReportStrategy(
        ideal_buy=result.get("ideal_buy"),
        secondary_buy=result.get("secondary_buy"),
        stop_loss=result.get("stop_loss"),
        take_profit=result.get("take_profit"),
    )

    fallback_fundamental = db_manager.get_latest_fundamental_snapshot(
        query_id=result.get("query_id", ""),
        code=result.get("stock_code", ""),
        owner_user_id=owner_user_id,
    )
    extracted_fundamental = extract_fundamental_detail_fields(
        context_snapshot=result.get("context_snapshot"),
        fallback_fundamental_payload=fallback_fundamental,
    )
    extracted_boards = extract_board_detail_fields(
        context_snapshot=result.get("context_snapshot"),
        fallback_fundamental_payload=fallback_fundamental,
    )
    company_profile = extract_company_profile_detail_field(
        context_snapshot=result.get("context_snapshot"),
        fallback_fundamental_payload=fallback_fundamental,
    )
    business_model = raw_result.get("business_model")
    profitability_analysis = raw_result.get("profitability_analysis")
    extracted_technical = extract_technical_detail_fields(
        context_snapshot=result.get("context_snapshot"),
        report_data=raw_result,
    )
    technical_indicators = extracted_technical.get("technical_indicators")
    technical_analysis_report = (
        raw_result.get("technical_analysis_report")
        or extracted_technical.get("technical_analysis_report")
    )
    kline_series = extracted_technical.get("kline_series")
    price_trend_analysis = (
        raw_result.get("price_trend_analysis")
        or extracted_technical.get("price_trend_analysis")
    )
    chip_distribution = extracted_technical.get("chip_distribution")
    key_levels = extracted_technical.get("key_levels")
    key_levels_analysis = (
        raw_result.get("key_levels_analysis")
        or extracted_technical.get("key_levels_analysis")
    )
    weekly_kline_series = extracted_technical.get("weekly_kline_series")
    weekly_trend_analysis = (
        raw_result.get("weekly_trend_analysis")
        or extracted_technical.get("weekly_trend_analysis")
    )
    capital_flow = extracted_technical.get("capital_flow")
    capital_flow_analysis = (
        raw_result.get("capital_flow_analysis")
        or extracted_technical.get("capital_flow_analysis")
    )
    financial_fundamentals_analysis = (
        raw_result.get("financial_fundamentals_analysis")
        or extracted_technical.get("financial_fundamentals_analysis")
    )

    backtest_result = None
    record_id = result.get("id")
    if record_id is not None:
        from src.services.backtest_service import BacktestService
        backtest_result = BacktestService(db_manager).get_completed_result_for_history(int(record_id))

    model_opinions = None
    if isinstance(context_snapshot, dict):
        model_opinions = context_snapshot.get("model_opinions")

    details = ReportDetails(
        news_content=result.get("news_content"),
        raw_result=raw_result,
        context_snapshot=result.get("context_snapshot"),
        financial_report=extracted_fundamental.get("financial_report"),
        dividend_metrics=extracted_fundamental.get("dividend_metrics"),
        company_profile=company_profile,
        business_model=business_model,
        profitability_analysis=profitability_analysis,
        financial_fundamentals_analysis=financial_fundamentals_analysis,
        technical_indicators=technical_indicators,
        technical_analysis_report=technical_analysis_report,
        kline_series=kline_series,
        price_trend_analysis=price_trend_analysis,
        chip_distribution=chip_distribution,
        key_levels=key_levels,
        key_levels_analysis=key_levels_analysis,
        weekly_kline_series=weekly_kline_series,
        weekly_trend_analysis=weekly_trend_analysis,
        capital_flow=capital_flow,
        capital_flow_analysis=capital_flow_analysis,
        belong_boards=extracted_boards.get("belong_boards"),
        sector_rankings=extracted_boards.get("sector_rankings"),
        backtest_result=backtest_result,
        model_opinions=model_opinions,
    )

    return AnalysisReport(
        meta=meta,
        summary=summary,
        strategy=strategy,
        details=details,
    )
