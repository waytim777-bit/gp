# -*- coding: utf-8 -*-
"""Public endpoints for shared analysis reports (no auth)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from api.deps import get_database_manager
from api.v1.schemas.public_reports import PublicSharedReportResponse
from src.report_print_token import verify_report_print_token
from src.storage import DatabaseManager
from src.services.history_service import HistoryService, MarkdownReportGenerationError
from src.services.history_report_builder import build_analysis_report
from src.services.report_public_share_service import ReportPublicShareError, ReportPublicShareService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/reports/{share_token}",
    response_model=PublicSharedReportResponse,
    summary="Get a publicly shared analysis report",
)
def get_public_shared_report(share_token: str) -> PublicSharedReportResponse:
    try:
        payload = ReportPublicShareService.get_instance().get_public_report(share_token)
        return PublicSharedReportResponse.model_validate(payload)
    except ReportPublicShareError as exc:
        status = 404 if exc.code == "not_found" else 400
        raise HTTPException(
            status_code=status,
            detail={"error": exc.code, "message": exc.message},
        ) from exc
    except Exception as exc:
        logger.error("Public shared report fetch failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"error": "internal_error", "message": "加载分享报告失败"},
        ) from exc


@router.get(
    "/report-print/{record_id}",
    summary="Get report data for internal PDF print rendering",
)
def get_report_print_data(
    record_id: str,
    token: str = Query(...),
    db_manager: DatabaseManager = Depends(get_database_manager),
) -> dict:
    owner_user_id = verify_report_print_token(token, record_id)
    if owner_user_id is None:
        raise HTTPException(
            status_code=403,
            detail={"error": "invalid_token", "message": "打印链接无效或已过期"},
        )

    service = HistoryService(db_manager)
    try:
        detail = service.resolve_and_get_detail(record_id, owner_user_id=owner_user_id)
        markdown = service.get_markdown_report(record_id, owner_user_id=owner_user_id)
    except MarkdownReportGenerationError as exc:
        raise HTTPException(
            status_code=500,
            detail={"error": "generation_failed", "message": exc.message},
        ) from exc
    except Exception as exc:
        logger.error("Report print data fetch failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"error": "internal_error", "message": "加载打印报告失败"},
        ) from exc

    if detail is None or markdown is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "not_found", "message": "报告不存在"},
        )

    return {
        "report": build_analysis_report(
            detail,
            db_manager,
            owner_user_id=owner_user_id,
        ).model_dump(by_alias=True),
        "markdown": markdown,
    }
