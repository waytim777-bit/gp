# -*- coding: utf-8 -*-
"""Prediction report marketplace API schemas."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class PredictionReportPreview(BaseModel):
    sentiment_score: Optional[int] = None
    operation_advice: Optional[str] = None
    trend_prediction: Optional[str] = None
    analysis_summary: Optional[str] = None


class PredictionReportBacktestPreview(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    available: bool = False
    tone: str = "neutral"
    label: str = "未回测"
    outcome: Optional[str] = None
    direction_correct: Optional[bool] = Field(default=None, alias="directionCorrect")
    stock_return_pct: Optional[float] = Field(default=None, alias="stockReturnPct")
    eval_window_days: Optional[int] = Field(default=None, alias="evalWindowDays")
    eval_status: Optional[str] = Field(default=None, alias="evalStatus")


class PredictionReportListingItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    analysis_history_id: Optional[int] = Field(default=None, alias="analysisHistoryId")
    seller_user_id: int = Field(alias="sellerUserId")
    seller_username: str = Field(alias="sellerUsername")
    code: str
    name: str
    market: str
    cycle_anchor_date: Optional[str] = Field(default=None, alias="cycleAnchorDate")
    report_type: str = Field(alias="reportType")
    purchase_credits: int = Field(alias="purchaseCredits")
    seller_reward_credits: int = Field(alias="sellerRewardCredits")
    is_mine: bool = Field(alias="isMine")
    purchased: bool
    can_view_full: bool = Field(alias="canViewFull")
    can_purchase: bool = Field(default=False, alias="canPurchase")
    is_current_cycle: bool = Field(default=False, alias="isCurrentCycle")
    has_purchase_record: bool = Field(default=False, alias="hasPurchaseRecord")
    buyer_history_id: Optional[int] = Field(default=None, alias="buyerHistoryId")
    preview: PredictionReportPreview
    like_count: int = Field(default=0, alias="likeCount")
    liked: bool = False
    created_at: Optional[str] = Field(default=None, alias="createdAt")
    backtest_preview: Optional[PredictionReportBacktestPreview] = Field(
        default=None,
        alias="backtestPreview",
    )


class PredictionReportPricing(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    purchase_credits: int = Field(alias="purchaseCredits")
    seller_reward_credits: int = Field(alias="sellerRewardCredits")
    platform_credits: int = Field(alias="platformCredits")


class PredictionReportListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    items: List[PredictionReportListingItem]
    total: int
    pricing: PredictionReportPricing


class SharePredictionReportRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    record_id: int = Field(alias="recordId")


class PurchasePredictionReportResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    listing_id: int = Field(alias="listingId")
    purchase_id: Optional[int] = Field(default=None, alias="purchaseId")
    buyer_history_id: Optional[int] = Field(default=None, alias="buyerHistoryId")
    already_purchased: bool = Field(alias="alreadyPurchased")
    credits_paid: int = Field(alias="creditsPaid")
    seller_credits: Optional[int] = Field(default=None, alias="sellerCredits")


class LikePredictionReportResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    listing_id: int = Field(alias="listingId")
    liked: bool
    like_count: int = Field(alias="likeCount")


class UpdatePredictionReportPricingRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    purchase_credits: int = Field(alias="purchaseCredits", ge=1)
    seller_reward_credits: int = Field(alias="sellerRewardCredits", ge=0)
