# -*- coding: utf-8 -*-
"""Admin endpoints for prediction report marketplace pricing."""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException

from api.deps import require_admin
from api.v1.schemas.prediction_reports import (
    PredictionReportPricing,
    UpdatePredictionReportPricingRequest,
)
from src.services.prediction_report_market_service import PredictionReportMarketService

router = APIRouter(prefix="/prediction-reports", tags=["Admin Prediction Reports"])


@router.get("/pricing", response_model=PredictionReportPricing)
def get_pricing(_admin=Depends(require_admin)) -> PredictionReportPricing:
    del _admin
    return PredictionReportPricing.model_validate(
        PredictionReportMarketService.get_instance().get_pricing()
    )


@router.patch("/pricing", response_model=PredictionReportPricing)
def update_pricing(
    request: UpdatePredictionReportPricingRequest,
    _admin=Depends(require_admin),
) -> PredictionReportPricing:
    del _admin
    if request.seller_reward_credits > request.purchase_credits:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_pricing",
                "message": "分享者收益不能高于购买价格",
            },
        )
    os.environ["PREDICTION_REPORT_PURCHASE_CREDITS"] = str(int(request.purchase_credits))
    os.environ["PREDICTION_REPORT_SELLER_CREDITS"] = str(int(request.seller_reward_credits))
    return PredictionReportPricing.model_validate(
        PredictionReportMarketService.get_instance().get_pricing()
    )
