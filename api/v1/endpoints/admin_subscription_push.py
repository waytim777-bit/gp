# -*- coding: utf-8 -*-
"""Admin subscription push management endpoints."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from api.deps import require_admin
from src.services.subscription_push_admin_service import SubscriptionPushAdminService

router = APIRouter(prefix="/subscription-push", tags=["Admin Subscription Push"])


def _service() -> SubscriptionPushAdminService:
    return SubscriptionPushAdminService.get_instance()


class SubscriptionOverviewRow(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    subscription_id: int = Field(alias="subscriptionId")
    user_id: int = Field(alias="userId")
    username: str
    is_admin: bool = Field(default=False, alias="isAdmin")
    credit_balance: int = Field(alias="creditBalance")
    notification_email: str = Field(alias="notificationEmail")
    has_webhook: bool = Field(alias="hasWebhook")
    code: str
    name: str = ""
    market: str
    interval_days: int = Field(alias="intervalDays")
    interval_label: str = Field(alias="intervalLabel")
    status: str
    next_push_on: Optional[str] = Field(default=None, alias="nextPushOn")
    last_pushed_on: Optional[str] = Field(default=None, alias="lastPushedOn")
    credits_per_push: int = Field(alias="creditsPerPush")
    is_due_today: bool = Field(alias="isDueToday")
    last_push_status: Optional[str] = Field(default=None, alias="lastPushStatus")
    last_push_at: Optional[str] = Field(default=None, alias="lastPushAt")
    last_push_error: str = Field(default="", alias="lastPushError")


class SubscriptionPushLogItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    subscription_id: int = Field(alias="subscriptionId")
    user_id: int = Field(alias="userId")
    username: str
    code: str
    pushed_on: Optional[str] = Field(default=None, alias="pushedOn")
    channel: str
    status: str
    credits_charged: int = Field(alias="creditsCharged")
    error_message: str = Field(default="", alias="errorMessage")
    created_at: Optional[str] = Field(default=None, alias="createdAt")


class SubscriptionOverviewStats(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    total_subscriptions: int = Field(alias="totalSubscriptions")
    active_subscriptions: int = Field(alias="activeSubscriptions")
    due_today: int = Field(alias="dueToday")


class SubscriptionOverviewResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    rows: List[SubscriptionOverviewRow]
    recent_logs: List[SubscriptionPushLogItem] = Field(alias="recentLogs")
    stats: SubscriptionOverviewStats


class DueSubscriptionItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    subscription_id: int = Field(alias="subscriptionId")
    user_id: int = Field(alias="userId")
    interval_days: int = Field(alias="intervalDays")
    next_push_on: Optional[str] = Field(default=None, alias="nextPushOn")
    credits_per_push: int = Field(alias="creditsPerPush")


class DueStockItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    code: str
    name: str = ""
    market: str
    analysis_date: str = Field(alias="analysisDate")
    market_open: bool = Field(alias="marketOpen")
    due_subscription_count: int = Field(alias="dueSubscriptionCount")
    has_analysis_cache: bool = Field(alias="hasAnalysisCache")
    subscriptions: List[DueSubscriptionItem]


class DueTodayResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    due_subscription_count: int = Field(alias="dueSubscriptionCount")
    stock_count: int = Field(alias="stockCount")
    stocks: List[DueStockItem]


class AnalyzeResultItem(BaseModel):
    code: str
    status: str
    cached: bool
    message: str = ""


class AnalyzeRequest(BaseModel):
    codes: Optional[List[str]] = None


class AnalyzeResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    due_subscription_count: int = Field(alias="dueSubscriptionCount")
    stock_count: int = Field(alias="stockCount")
    codes_analyzed: int = Field(alias="codesAnalyzed")
    codes_cached: int = Field(alias="codesCached")
    codes_failed: int = Field(alias="codesFailed")
    results: List[AnalyzeResultItem]
    errors: List[str] = Field(default_factory=list)


class DeliverRequest(BaseModel):
    codes: Optional[List[str]] = None


class DeliverResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    due_count: int = Field(alias="dueCount")
    pushes_success: int = Field(alias="pushesSuccess")
    pushes_failed: int = Field(alias="pushesFailed")
    pushes_skipped: int = Field(alias="pushesSkipped")
    credits_charged: int = Field(alias="creditsCharged")
    errors: List[str] = Field(default_factory=list)


@router.get("/overview", response_model=SubscriptionOverviewResponse)
def get_subscription_push_overview(
    log_limit: int = 50,
    _admin: None = Depends(require_admin()),
):
    payload = _service().get_overview(log_limit=max(1, min(log_limit, 200)))
    return SubscriptionOverviewResponse.model_validate(payload)


@router.get("/due-today", response_model=DueTodayResponse)
def preview_due_today(_admin: None = Depends(require_admin())):
    return DueTodayResponse.model_validate(_service().preview_due_today())


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze_due_subscriptions(
    body: AnalyzeRequest,
    _admin: None = Depends(require_admin()),
):
    return AnalyzeResponse.model_validate(_service().analyze_due(codes=body.codes))


@router.post("/deliver", response_model=DeliverResponse)
def deliver_due_subscriptions(
    body: DeliverRequest,
    _admin: None = Depends(require_admin()),
):
    return DeliverResponse.model_validate(_service().deliver_due(codes=body.codes))
