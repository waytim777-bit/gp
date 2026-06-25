# -*- coding: utf-8 -*-
"""
===================================
历史记录接口
===================================

职责：
1. 提供 GET /api/v1/history 历史列表查询接口
2. 提供 GET /api/v1/history/{query_id} 历史详情查询接口
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Depends, Body

from api.deps import get_current_user, get_database_manager
from src.user_context import CurrentUser
from api.v1.schemas.history import (
    HistoryListResponse,
    HistoryItem,
    DeleteHistoryRequest,
    DeleteHistoryResponse,
    NewsIntelItem,
    NewsIntelResponse,
    AnalysisReport,
    MarkdownReportResponse,
)
from api.v1.schemas.public_reports import ReportShareLinkResponse
from api.v1.schemas.common import ErrorResponse
from src.storage import DatabaseManager
from src.services.history_service import HistoryService, MarkdownReportGenerationError
from src.services.history_report_builder import build_analysis_report
from src.services.report_public_share_service import ReportPublicShareError, ReportPublicShareService

logger = logging.getLogger(__name__)

router = APIRouter()


def _owner_user_id_from_dependency(current_user) -> Optional[int]:
    """Return the resolved request user id, or None for direct unit calls."""
    return current_user.id if isinstance(current_user, CurrentUser) else None


@router.get(
    "",
    response_model=HistoryListResponse,
    responses={
        200: {"description": "历史记录列表"},
        500: {"description": "服务器错误", "model": ErrorResponse},
    },
    summary="获取历史分析列表",
    description="分页获取历史分析记录摘要，支持按股票代码和日期范围筛选"
)
def get_history_list(
    stock_code: Optional[str] = Query(None, description="股票代码筛选"),
    start_date: Optional[str] = Query(None, description="开始日期 (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="结束日期 (YYYY-MM-DD)"),
    page: int = Query(1, ge=1, description="页码（从 1 开始）"),
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
    db_manager: DatabaseManager = Depends(get_database_manager),
    current_user: CurrentUser = Depends(get_current_user),
) -> HistoryListResponse:
    """
    获取历史分析列表

    分页获取历史分析记录摘要，支持按股票代码和日期范围筛选

    Args:
        stock_code: 股票代码筛选
        start_date: 开始日期
        end_date: 结束日期
        page: 页码
        limit: 每页数量
        db_manager: 数据库管理器依赖

    Returns:
        HistoryListResponse: 历史记录列表
    """
    try:
        service = HistoryService(db_manager)
        
        # 使用 def 而非 async def，FastAPI 自动在线程池中执行
        result = service.get_history_list(
            stock_code=stock_code,
            start_date=start_date,
            end_date=end_date,
            page=page,
            limit=limit,
            owner_user_id=_owner_user_id_from_dependency(current_user),
        )
        
        # 转换为响应模型
        items = [
            HistoryItem(
                id=item.get("id"),
                query_id=item.get("query_id", ""),
                stock_code=item.get("stock_code", ""),
                stock_name=item.get("stock_name"),
                report_type=item.get("report_type"),
                sentiment_score=item.get("sentiment_score"),
                operation_advice=item.get("operation_advice"),
                cycle_version=item.get("cycle_version"),
                created_at=item.get("created_at")
            )
            for item in result.get("items", [])
        ]
        
        return HistoryListResponse(
            total=result.get("total", 0),
            page=page,
            limit=limit,
            items=items
        )
        
    except Exception as e:
        logger.error(f"查询历史列表失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "internal_error",
                "message": f"查询历史列表失败: {str(e)}"
            }
        )


@router.delete(
    "",
    response_model=DeleteHistoryResponse,
    responses={
        200: {"description": "删除成功"},
        400: {"description": "请求参数错误", "model": ErrorResponse},
        500: {"description": "服务器错误", "model": ErrorResponse},
    },
    summary="删除历史分析记录",
    description="按历史记录主键 ID 批量删除分析历史"
)
def delete_history_records(
    request: DeleteHistoryRequest = Body(...),
    db_manager: DatabaseManager = Depends(get_database_manager),
    current_user: CurrentUser = Depends(get_current_user),
) -> DeleteHistoryResponse:
    """
    按主键 ID 批量删除历史分析记录。
    """
    record_ids = sorted({record_id for record_id in request.record_ids if record_id is not None})
    if not record_ids:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_request",
                "message": "record_ids 不能为空"
            }
        )

    try:
        service = HistoryService(db_manager)
        deleted = service.delete_history_records(
            record_ids,
            owner_user_id=_owner_user_id_from_dependency(current_user),
        )
        return DeleteHistoryResponse(deleted=deleted)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除历史记录失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "internal_error",
                "message": f"删除历史记录失败: {str(e)}"
            }
        )


@router.get(
    "/{record_id}",
    response_model=AnalysisReport,
    responses={
        200: {"description": "报告详情"},
        404: {"description": "报告不存在", "model": ErrorResponse},
        500: {"description": "服务器错误", "model": ErrorResponse},
    },
    summary="获取历史报告详情",
    description="根据分析历史记录 ID 或 query_id 获取完整的历史分析报告"
)
def get_history_detail(
    record_id: str,
    db_manager: DatabaseManager = Depends(get_database_manager),
    current_user: CurrentUser = Depends(get_current_user),
) -> AnalysisReport:
    """
    获取历史报告详情
    
    根据分析历史记录主键 ID 或 query_id 获取完整的历史分析报告。
    优先尝试按主键 ID（整数）查询，若参数不是合法整数则按 query_id 查询。
    
    Args:
        record_id: 分析历史记录主键 ID（整数）或 query_id（字符串）
        db_manager: 数据库管理器依赖
        
    Returns:
        AnalysisReport: 完整分析报告
        
    Raises:
        HTTPException: 404 - 报告不存在
    """
    try:
        service = HistoryService(db_manager)
        
        # Try integer ID first, fall back to query_id string lookup
        result = service.resolve_and_get_detail(
            record_id,
            owner_user_id=_owner_user_id_from_dependency(current_user),
        )
        
        if result is None:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": "not_found",
                    "message": f"未找到 id/query_id={record_id} 的分析记录"
                }
            )

        return build_analysis_report(result, db_manager)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"查询历史详情失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "internal_error",
                "message": f"查询历史详情失败: {str(e)}"
            }
        )


@router.post(
    "/{record_id}/share-link",
    response_model=ReportShareLinkResponse,
    summary="Enable public share link for a history report",
)
def enable_history_share_link(
    record_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> ReportShareLinkResponse:
    try:
        history_id = int(record_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_request", "message": "record_id 必须为整数"},
        ) from exc
    try:
        payload = ReportPublicShareService.get_instance().enable_share(
            owner_user_id=int(current_user.id),
            history_id=history_id,
        )
        return ReportShareLinkResponse.model_validate(payload)
    except ReportPublicShareError as exc:
        status = 404 if exc.code == "not_found" else 403 if exc.code == "forbidden" else 400
        raise HTTPException(status_code=status, detail={"error": exc.code, "message": exc.message}) from exc


@router.get(
    "/{record_id}/share-link",
    response_model=ReportShareLinkResponse,
    summary="Get public share link for a history report",
)
def get_history_share_link(
    record_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> ReportShareLinkResponse:
    try:
        history_id = int(record_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_request", "message": "record_id 必须为整数"},
        ) from exc
    payload = ReportPublicShareService.get_instance().get_share_link(
        owner_user_id=int(current_user.id),
        history_id=history_id,
    )
    if payload is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": "该报告尚未开启分享"},
        )
    return ReportShareLinkResponse.model_validate(payload)


@router.delete(
    "/{record_id}/share-link",
    summary="Revoke public share link for a history report",
)
def revoke_history_share_link(
    record_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    try:
        history_id = int(record_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_request", "message": "record_id 必须为整数"},
        ) from exc
    revoked = ReportPublicShareService.get_instance().revoke_share(
        owner_user_id=int(current_user.id),
        history_id=history_id,
    )
    if not revoked:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": "该报告尚未开启分享"},
        )
    return {"revoked": True}


@router.get(
    "/{record_id}/news",
    response_model=NewsIntelResponse,
    responses={
        200: {"description": "新闻情报列表"},
        500: {"description": "服务器错误", "model": ErrorResponse},
    },
    summary="获取历史报告关联新闻",
    description="根据分析历史记录 ID 获取关联的新闻情报列表（为空也返回 200）"
)
def get_history_news(
    record_id: str,
    limit: int = Query(20, ge=1, le=100, description="返回数量限制"),
    db_manager: DatabaseManager = Depends(get_database_manager),
    current_user: CurrentUser = Depends(get_current_user),
) -> NewsIntelResponse:
    """
    获取历史报告关联新闻

    根据分析历史记录 ID 或 query_id 获取关联的新闻情报列表。
    在内部完成 record_id → query_id 的解析。

    Args:
        record_id: 分析历史记录主键 ID（整数）或 query_id（字符串）
        limit: 返回数量限制
        db_manager: 数据库管理器依赖

    Returns:
        NewsIntelResponse: 新闻情报列表
    """
    try:
        service = HistoryService(db_manager)
        items = service.resolve_and_get_news(
            record_id=record_id,
            limit=limit,
            owner_user_id=_owner_user_id_from_dependency(current_user),
        )

        response_items = [
            NewsIntelItem(
                title=item.get("title", ""),
                snippet=item.get("snippet"),
                url=item.get("url", "")
            )
            for item in items
        ]

        return NewsIntelResponse(
            total=len(response_items),
            items=response_items
        )

    except Exception as e:
        logger.error(f"查询新闻情报失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "internal_error",
                "message": f"查询新闻情报失败: {str(e)}"
            }
        )


@router.get(
    "/{record_id}/markdown",
    response_model=MarkdownReportResponse,
    responses={
        200: {"description": "Markdown 格式报告"},
        404: {"description": "报告不存在", "model": ErrorResponse},
        500: {"description": "服务器错误", "model": ErrorResponse},
    },
    summary="获取历史报告 Markdown 格式",
    description="根据分析历史记录 ID 获取 Markdown 格式的完整分析报告"
)
def get_history_markdown(
    record_id: str,
    db_manager: DatabaseManager = Depends(get_database_manager),
    current_user: CurrentUser = Depends(get_current_user),
) -> MarkdownReportResponse:
    """
    获取历史报告的 Markdown 格式内容

    根据分析历史记录 ID 或 query_id 生成与推送通知格式一致的 Markdown 报告。

    Args:
        record_id: 分析历史记录主键 ID（整数）或 query_id（字符串）
        db_manager: 数据库管理器依赖

    Returns:
        MarkdownReportResponse: Markdown 格式的完整报告

    Raises:
        HTTPException: 404 - 报告不存在
        HTTPException: 500 - 报告生成失败（服务器内部错误）
    """
    service = HistoryService(db_manager)

    try:
        markdown_content = service.get_markdown_report(
            record_id,
            owner_user_id=_owner_user_id_from_dependency(current_user),
        )
    except MarkdownReportGenerationError as e:
        logger.error(f"Markdown report generation failed for {record_id}: {e.message}")
        raise HTTPException(
            status_code=500,
            detail={
                "error": "generation_failed",
                "message": f"生成 Markdown 报告失败: {e.message}"
            }
        )
    except Exception as e:
        logger.error(f"获取 Markdown 报告失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "internal_error",
                "message": f"获取 Markdown 报告失败: {str(e)}"
            }
        )

    if markdown_content is None:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "not_found",
                "message": f"未找到 id/query_id={record_id} 的分析记录"
            }
        )

    return MarkdownReportResponse(content=markdown_content)
