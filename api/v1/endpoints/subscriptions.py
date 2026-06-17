# -*- coding: utf-8 -*-
"""Stock subscription endpoints (profile, CRUD, push logs)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from api.deps import get_current_user
from api.v1.schemas.subscriptions import (
    NotificationProfileResponse,
    NotificationProfileUpdateRequest,
    SubscriptionCreateRequest,
    SubscriptionItemResponse,
    SubscriptionListResponse,
    SubscriptionPricingResponse,
    SubscriptionPushLogListResponse,
    SubscriptionUpdateRequest,
)
from src.services.subscription_service import SubscriptionService, SubscriptionValidationError
from src.user_context import CurrentUser

logger = logging.getLogger(__name__)

router = APIRouter()


def _service() -> SubscriptionService:
    return SubscriptionService.get_instance()


def _validation_error(exc: SubscriptionValidationError) -> HTTPException:
    return HTTPException(
        status_code=400,
        detail={"error": "validation_error", "message": str(exc)},
    )


@router.get(
    "/profile",
    response_model=NotificationProfileResponse,
    summary="Get notification profile",
)
async def get_notification_profile(current_user: CurrentUser = Depends(get_current_user)):
    payload = _service().get_profile(current_user.id)
    return NotificationProfileResponse.model_validate(payload)


@router.put(
    "/profile",
    response_model=NotificationProfileResponse,
    summary="Update notification profile",
)
async def update_notification_profile(
    body: NotificationProfileUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    try:
        payload = _service().save_profile(
            current_user.id,
            notification_email=body.notification_email,
            webhook_urls=body.webhook_urls,
            webhook_bearer_token=body.webhook_bearer_token,
            clear_bearer_token=body.clear_webhook_bearer_token,
        )
    except SubscriptionValidationError as exc:
        raise _validation_error(exc) from exc
    return NotificationProfileResponse.model_validate(payload)


@router.get(
    "/pricing",
    response_model=SubscriptionPricingResponse,
    summary="Get subscription pricing",
)
async def get_subscription_pricing(current_user: CurrentUser = Depends(get_current_user)):
    _ = current_user
    return SubscriptionPricingResponse.model_validate(_service().get_pricing())


@router.get(
    "",
    response_model=SubscriptionListResponse,
    summary="List stock subscriptions",
)
async def list_subscriptions(current_user: CurrentUser = Depends(get_current_user)):
    payload = _service().list_subscriptions(current_user.id)
    return SubscriptionListResponse.model_validate(payload)


@router.post(
    "",
    response_model=SubscriptionItemResponse,
    summary="Create stock subscription",
)
async def create_subscription(
    body: SubscriptionCreateRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    try:
        payload = _service().create_subscription(
            current_user.id,
            code=body.code,
            name=body.name,
            interval_days=body.interval_days,
        )
    except SubscriptionValidationError as exc:
        raise _validation_error(exc) from exc
    return SubscriptionItemResponse.model_validate(payload)


@router.get(
    "/push-logs",
    response_model=SubscriptionPushLogListResponse,
    summary="List recent subscription push logs",
)
async def list_subscription_push_logs(
    limit: int = 20,
    current_user: CurrentUser = Depends(get_current_user),
):
    items = _service().list_push_logs(current_user.id, limit=max(1, min(limit, 100)))
    return SubscriptionPushLogListResponse.model_validate({"items": items})


@router.patch(
    "/{subscription_id}",
    response_model=SubscriptionItemResponse,
    summary="Update stock subscription",
)
async def update_subscription(
    subscription_id: int,
    body: SubscriptionUpdateRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    try:
        payload = _service().update_subscription(
            current_user.id,
            subscription_id,
            interval_days=body.interval_days,
            status=body.status,
        )
    except SubscriptionValidationError as exc:
        raise _validation_error(exc) from exc
    return SubscriptionItemResponse.model_validate(payload)


@router.delete(
    "/{subscription_id}",
    summary="Delete stock subscription",
)
async def delete_subscription(
    subscription_id: int,
    current_user: CurrentUser = Depends(get_current_user),
):
    try:
        _service().delete_subscription(current_user.id, subscription_id)
    except SubscriptionValidationError as exc:
        raise _validation_error(exc) from exc
    return {"success": True}
