# -*- coding: utf-8 -*-
"""Prediction report marketplace endpoints."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from api.deps import get_current_user
from api.v1.schemas.prediction_reports import (
    LikePredictionReportResponse,
    PredictionReportListResponse,
    PredictionReportListingItem,
    PredictionReportPricing,
    PurchasePredictionReportResponse,
    SharePredictionReportRequest,
)
from src.services.credit_service import InsufficientCreditsError
from src.services.prediction_report_market_service import (
    PredictionReportMarketError,
    PredictionReportMarketService,
)
from src.user_context import CurrentUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/prediction-reports", tags=["Prediction Reports"])


def _service() -> PredictionReportMarketService:
    return PredictionReportMarketService.get_instance()


@router.get("", response_model=PredictionReportListResponse, summary="List prediction reports")
def list_prediction_reports(
    current_user: CurrentUser = Depends(get_current_user),
) -> PredictionReportListResponse:
    payload = _service().list_reports(viewer_user_id=int(current_user.id))
    return PredictionReportListResponse.model_validate(payload)


@router.get("/pricing", response_model=PredictionReportPricing, summary="Get marketplace pricing")
def get_prediction_report_pricing(
    current_user: CurrentUser = Depends(get_current_user),
) -> PredictionReportPricing:
    del current_user
    return PredictionReportPricing.model_validate(_service().get_pricing())


@router.post("/recommend", response_model=PredictionReportListingItem, summary="Recommend a prediction report")
def recommend_prediction_report(
    request: SharePredictionReportRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> PredictionReportListingItem:
    try:
        payload = _service().recommend_report(
            owner_user_id=int(current_user.id),
            history_id=int(request.record_id),
        )
        return PredictionReportListingItem.model_validate(payload)
    except PredictionReportMarketError as exc:
        raise HTTPException(status_code=400, detail={"error": exc.code, "message": exc.message}) from exc
    except Exception as exc:
        logger.error("Recommend prediction report failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail={"error": "internal_error", "message": "推荐失败"}) from exc


@router.post("/share", response_model=PredictionReportListingItem, summary="Recommend a prediction report (legacy alias)")
def share_prediction_report(
    request: SharePredictionReportRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> PredictionReportListingItem:
    return recommend_prediction_report(request, current_user)


@router.get("/{listing_id}", response_model=PredictionReportListingItem, summary="Get listing detail")
def get_prediction_report(
    listing_id: int,
    current_user: CurrentUser = Depends(get_current_user),
) -> PredictionReportListingItem:
    try:
        payload = _service().get_listing(
            listing_id=int(listing_id),
            viewer_user_id=int(current_user.id),
        )
        return PredictionReportListingItem.model_validate(payload)
    except PredictionReportMarketError as exc:
        status = 404 if exc.code == "not_found" else 400
        raise HTTPException(status_code=status, detail={"error": exc.code, "message": exc.message}) from exc


@router.post(
    "/{listing_id}/like",
    response_model=LikePredictionReportResponse,
    summary="Like or unlike a shared prediction report",
)
def like_prediction_report(
    listing_id: int,
    current_user: CurrentUser = Depends(get_current_user),
) -> LikePredictionReportResponse:
    try:
        payload = _service().like_report(
            listing_id=int(listing_id),
            user_id=int(current_user.id),
        )
        return LikePredictionReportResponse.model_validate(payload)
    except PredictionReportMarketError as exc:
        status = 404 if exc.code == "not_found" else 400
        raise HTTPException(status_code=status, detail={"error": exc.code, "message": exc.message}) from exc


@router.post(
    "/{listing_id}/purchase",
    response_model=PurchasePredictionReportResponse,
    summary="Purchase a shared prediction report",
)
def purchase_prediction_report(
    listing_id: int,
    current_user: CurrentUser = Depends(get_current_user),
) -> PurchasePredictionReportResponse:
    try:
        payload = _service().purchase_report(
            buyer_user_id=int(current_user.id),
            listing_id=int(listing_id),
        )
        return PurchasePredictionReportResponse.model_validate(payload)
    except InsufficientCreditsError as exc:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "insufficient_credits",
                "message": f"积分不足：需要 {exc.required}，当前 {exc.balance}",
                "required": exc.required,
                "balance": exc.balance,
            },
        ) from exc
    except PredictionReportMarketError as exc:
        status = 404 if exc.code == "not_found" else 400
        raise HTTPException(status_code=status, detail={"error": exc.code, "message": exc.message}) from exc
    except Exception as exc:
        logger.error("Purchase prediction report failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail={"error": "internal_error", "message": "购买失败"}) from exc
