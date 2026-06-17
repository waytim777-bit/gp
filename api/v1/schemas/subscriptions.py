# -*- coding: utf-8 -*-
"""Subscription API schemas."""

from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class NotificationProfileResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    notification_email: str = Field(default="", alias="notificationEmail")
    webhook_urls: str = Field(default="", alias="webhookUrls")
    has_webhook_bearer_token: bool = Field(default=False, alias="hasWebhookBearerToken")


class NotificationProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    notification_email: str = Field(default="", alias="notificationEmail")
    webhook_urls: str = Field(default="", alias="webhookUrls")
    webhook_bearer_token: Optional[str] = Field(default=None, alias="webhookBearerToken")
    clear_webhook_bearer_token: bool = Field(default=False, alias="clearWebhookBearerToken")


class SubscriptionItemResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    code: str
    name: str = ""
    market: str
    interval_days: int = Field(alias="intervalDays")
    interval_label: str = Field(alias="intervalLabel")
    status: str
    anchor_date: Optional[str] = Field(default=None, alias="anchorDate")
    last_pushed_on: Optional[str] = Field(default=None, alias="lastPushedOn")
    next_push_on: Optional[str] = Field(default=None, alias="nextPushOn")
    credits_per_push: int = Field(alias="creditsPerPush")
    estimated_monthly_credits: int = Field(alias="estimatedMonthlyCredits")
    created_at: Optional[str] = Field(default=None, alias="createdAt")


class SubscriptionListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    items: List[SubscriptionItemResponse]
    total: int
    active_count: int = Field(alias="activeCount")


class SubscriptionCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    code: str
    name: Optional[str] = None
    interval_days: int = Field(default=1, alias="intervalDays")


class SubscriptionUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    interval_days: Optional[int] = Field(default=None, alias="intervalDays")
    status: Optional[str] = None


class SubscriptionPricingResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    credits_per_push: int = Field(alias="creditsPerPush")
    trading_days_per_month: int = Field(alias="tradingDaysPerMonth")
    estimated_monthly_by_interval: Dict[str, int] = Field(alias="estimatedMonthlyByInterval")


class SubscriptionPushLogItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    subscription_id: int = Field(alias="subscriptionId")
    code: str
    pushed_on: Optional[str] = Field(default=None, alias="pushedOn")
    channel: str
    status: str
    credits_charged: int = Field(alias="creditsCharged")
    error_message: str = Field(default="", alias="errorMessage")
    created_at: Optional[str] = Field(default=None, alias="createdAt")


class SubscriptionPushLogListResponse(BaseModel):
    items: List[SubscriptionPushLogItem]
