# -*- coding: utf-8 -*-
"""
===================================
分析服务层
===================================

职责：
1. 封装股票分析逻辑
2. 调用 analyzer 和 pipeline 执行分析
3. 保存分析结果到数据库
"""

import json
import logging
import uuid
from typing import Optional, Dict, Any, Callable

from src.repositories.analysis_repo import AnalysisRepository
from src.report_language import (
    get_sentiment_label,
    get_localized_stock_name,
    localize_operation_advice,
    localize_trend_prediction,
    normalize_report_language,
)

logger = logging.getLogger(__name__)


class AnalysisService:
    """
    分析服务
    
    封装股票分析相关的业务逻辑
    """
    
    def __init__(self):
        """初始化分析服务"""
        self.repo = AnalysisRepository()
        self.last_error: Optional[str] = None
    
    def analyze_stock(
        self,
        stock_code: str,
        report_type: str = "detailed",
        force_refresh: bool = False,
        query_id: Optional[str] = None,
        send_notification: bool = True,
        progress_callback: Optional[Callable[[int, str], None]] = None,
        analysis_mode: str = "full",
    ) -> Optional[Dict[str, Any]]:
        """
        执行股票分析
        
        Args:
            stock_code: 股票代码
            report_type: 报告类型 (simple/detailed)
            force_refresh: 是否强制刷新
            query_id: 查询 ID（可选）
            send_notification: 是否发送通知（API 触发默认发送）
            
        Returns:
            分析结果字典，包含:
            - stock_code: 股票代码
            - stock_name: 股票名称
            - report: 分析报告
        """
        try:
            self.last_error = None
            from src.enums import ReportType
            from src.services.shared_analysis_service import (
                SharedAnalysisPurchaseRequiredError,
                SharedAnalysisService,
            )

            if query_id is None:
                query_id = uuid.uuid4().hex

            rt = ReportType.from_str(report_type)
            effective_mode = "refresh_intel" if analysis_mode == "refresh_intel" else "full"
            outcome = SharedAnalysisService.get_instance().get_or_create(
                code=stock_code,
                report_type=rt,
                force_refresh=force_refresh,
                query_id=query_id,
                allow_intel_probe=False,
                charge_probe_credits=False,
                single_stock_notify=send_notification,
                progress_callback=progress_callback,
                query_source="api",
                analysis_mode=effective_mode,
            )

            if outcome.history_id is None:
                if outcome.result is not None and not getattr(outcome.result, "success", True):
                    self.last_error = getattr(outcome.result, "error_message", None) or (
                        f"分析股票 {stock_code} 失败"
                    )
                else:
                    self.last_error = self.last_error or f"分析股票 {stock_code} 返回空结果"
                logger.warning("分析股票 %s 未成功: %s", stock_code, self.last_error)
                return None

            if outcome.from_cache or outcome.result is None:
                return self._build_analysis_response_from_history(
                    outcome.history_id,
                    query_id,
                    report_type=rt.value,
                    cycle=outcome.cycle,
                    from_cache=outcome.from_cache,
                    probe_credits_charged=outcome.probe_credits_charged,
                )

            return self._build_analysis_response(
                outcome.result,
                query_id,
                report_type=rt.value,
                cycle=outcome.cycle,
                from_cache=False,
            )

        except SharedAnalysisPurchaseRequiredError as exc:
            self.last_error = str(exc)
            logger.info("分析股票 %s 需先购买预测报告", stock_code)
            return None
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"分析股票 {stock_code} 失败: {e}", exc_info=True)
            return None
    
    def _build_analysis_response(
        self, 
        result: Any, 
        query_id: str,
        report_type: str = "detailed",
        cycle: Any = None,
        from_cache: bool = False,
    ) -> Dict[str, Any]:
        """
        构建分析响应
        
        Args:
            result: AnalysisResult 对象
            query_id: 查询 ID
            report_type: 归一化后的报告类型
            
        Returns:
            格式化的响应字典
        """
        # 获取狙击点位
        sniper_points = {}
        if hasattr(result, 'get_sniper_points'):
            sniper_points = result.get_sniper_points() or {}
        
        # 计算情绪标签
        report_language = normalize_report_language(getattr(result, "report_language", "zh"))
        sentiment_label = get_sentiment_label(result.sentiment_score, report_language)
        stock_name = get_localized_stock_name(getattr(result, "name", None), result.code, report_language)
        
        # 构建报告结构
        report = {
            "meta": {
                "query_id": query_id,
                "stock_code": result.code,
                "stock_name": stock_name,
                "report_type": report_type,
                "report_language": report_language,
                "current_price": result.current_price,
                "change_pct": result.change_pct,
                "model_used": getattr(result, "model_used", None),
            },
            "summary": {
                "analysis_summary": result.analysis_summary,
                "operation_advice": localize_operation_advice(result.operation_advice, report_language),
                "trend_prediction": localize_trend_prediction(result.trend_prediction, report_language),
                "sentiment_score": result.sentiment_score,
                "sentiment_label": sentiment_label,
            },
            "strategy": {
                "ideal_buy": sniper_points.get("ideal_buy"),
                "secondary_buy": sniper_points.get("secondary_buy"),
                "stop_loss": sniper_points.get("stop_loss"),
                "take_profit": sniper_points.get("take_profit"),
            },
            "details": {
                "news_summary": result.news_summary,
                "technical_analysis": result.technical_analysis,
                "fundamental_analysis": result.fundamental_analysis,
                "business_model": getattr(result, "business_model", None),
                "profitability_analysis": getattr(result, "profitability_analysis", None),
                "financial_fundamentals_analysis": getattr(result, "financial_fundamentals_analysis", None),
                "technical_analysis_report": getattr(result, "technical_analysis_report", None),
                "price_trend_analysis": getattr(result, "price_trend_analysis", None),
                "key_levels_analysis": getattr(result, "key_levels_analysis", None),
                "weekly_trend_analysis": getattr(result, "weekly_trend_analysis", None),
                "capital_flow_analysis": getattr(result, "capital_flow_analysis", None),
                "risk_warning": result.risk_warning,
            }
        }
        
        return {
            "stock_code": result.code,
            "stock_name": stock_name,
            "report": report,
            "prediction_cycle": self._build_cycle_meta(cycle, from_cache=from_cache),
        }

    def _build_analysis_response_from_history(
        self,
        history_id: int,
        query_id: str,
        *,
        report_type: str,
        cycle: Any = None,
        from_cache: bool = True,
        probe_credits_charged: int = 0,
    ) -> Optional[Dict[str, Any]]:
        record = self.repo.db.get_analysis_history_by_id(int(history_id), scoped=False)
        if record is None:
            self.last_error = f"分析记录 {history_id} 不存在"
            return None

        raw_payload: Dict[str, Any] = {}
        if record.raw_result:
            try:
                parsed = json.loads(record.raw_result)
                if isinstance(parsed, dict):
                    raw_payload = parsed
            except Exception:
                raw_payload = {}

        report_language = normalize_report_language(raw_payload.get("report_language", "zh"))
        sentiment_score = record.sentiment_score
        stock_code = record.code
        stock_name = get_localized_stock_name(record.name, stock_code, report_language)
        sentiment_label = get_sentiment_label(sentiment_score, report_language) if sentiment_score is not None else ""

        report = {
            "meta": {
                "query_id": query_id,
                "stock_code": stock_code,
                "stock_name": stock_name,
                "report_type": report_type,
                "report_language": report_language,
                "current_price": raw_payload.get("current_price"),
                "change_pct": raw_payload.get("change_pct"),
                "model_used": raw_payload.get("model_used"),
            },
            "summary": {
                "analysis_summary": record.analysis_summary,
                "operation_advice": localize_operation_advice(record.operation_advice, report_language),
                "trend_prediction": localize_trend_prediction(record.trend_prediction, report_language),
                "sentiment_score": sentiment_score,
                "sentiment_label": sentiment_label,
            },
            "strategy": {
                "ideal_buy": record.ideal_buy,
                "secondary_buy": record.secondary_buy,
                "stop_loss": record.stop_loss,
                "take_profit": record.take_profit,
            },
            "details": {
                "news_summary": raw_payload.get("news_summary"),
                "technical_analysis": raw_payload.get("technical_analysis"),
                "fundamental_analysis": raw_payload.get("fundamental_analysis"),
                "business_model": raw_payload.get("business_model"),
                "profitability_analysis": raw_payload.get("profitability_analysis"),
                "financial_fundamentals_analysis": raw_payload.get("financial_fundamentals_analysis"),
                "technical_analysis_report": raw_payload.get("technical_analysis_report"),
                "price_trend_analysis": raw_payload.get("price_trend_analysis"),
                "key_levels_analysis": raw_payload.get("key_levels_analysis"),
                "weekly_trend_analysis": raw_payload.get("weekly_trend_analysis"),
                "capital_flow_analysis": raw_payload.get("capital_flow_analysis"),
                "risk_warning": raw_payload.get("risk_warning"),
            },
        }

        cycle_meta = self._build_cycle_meta(cycle, from_cache=from_cache)
        if probe_credits_charged > 0:
            cycle_meta["probe_credits_charged"] = probe_credits_charged

        return {
            "stock_code": stock_code,
            "stock_name": stock_name,
            "report": report,
            "prediction_cycle": cycle_meta,
        }

    @staticmethod
    def _build_cycle_meta(cycle: Any, *, from_cache: bool) -> Dict[str, Any]:
        if cycle is None:
            return {"from_cache": from_cache}
        return {
            "from_cache": from_cache,
            "cycle_anchor_date": cycle.cycle_anchor_date.isoformat(),
            "prediction_target_date": cycle.prediction_target_date.isoformat(),
            "data_as_of_date": cycle.data_as_of_date.isoformat(),
        }
