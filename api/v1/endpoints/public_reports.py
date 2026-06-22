# -*- coding: utf-8 -*-
"""Public endpoints for shared analysis reports (no auth)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from api.v1.schemas.public_reports import PublicSharedReportResponse
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
