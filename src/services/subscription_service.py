# -*- coding: utf-8 -*-
"""Stock subscription and notification profile service (phase A: CRUD only)."""

from __future__ import annotations

import logging
import os
import re
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from data_provider.base import canonical_stock_code
from src.core.trading_calendar import add_trading_days, get_effective_trading_date, get_market_for_stock
from src.data.stock_mapping import STOCK_NAME_MAP
from src.storage import DatabaseManager, StockSubscription, UserNotificationProfile

logger = logging.getLogger(__name__)

ALLOWED_INTERVAL_DAYS = {1, 3, 5}
_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SubscriptionValidationError(ValueError):
    """Raised when subscription input fails validation."""


class SubscriptionService:
    _instance: Optional["SubscriptionService"] = None

    @classmethod
    def get_instance(cls) -> "SubscriptionService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @staticmethod
    def _parse_positive_int_env(name: str, default: int) -> int:
        raw = os.getenv(name)
        if raw is None or not str(raw).strip():
            return default
        try:
            value = int(raw)
        except ValueError:
            logger.warning("Invalid %s=%r, falling back to %d", name, raw, default)
            return default
        return value if value > 0 else default

    def get_credits_per_push(self) -> int:
        return self._parse_positive_int_env("SUBSCRIPTION_CREDITS_PER_PUSH", 30)

    def get_max_subscriptions_per_user(self) -> int:
        return self._parse_positive_int_env("SUBSCRIPTION_MAX_PER_USER", 20)

    def get_trading_days_per_month(self) -> int:
        return self._parse_positive_int_env("SUBSCRIPTION_TRADING_DAYS_PER_MONTH", 22)

    @staticmethod
    def _normalize_webhook_urls(raw: str) -> str:
        parts = [item.strip() for item in (raw or "").split(",") if item.strip()]
        return ",".join(parts)

    @staticmethod
    def _validate_email(email: str) -> None:
        candidate = (email or "").strip()
        if not candidate:
            return
        if not _EMAIL_PATTERN.match(candidate):
            raise SubscriptionValidationError("邮箱格式无效")

    def _validate_notification_profile(
        self,
        notification_email: Optional[str],
        webhook_urls: Optional[str],
    ) -> Tuple[Optional[str], Optional[str]]:
        email = (notification_email or "").strip() or None
        webhooks = self._normalize_webhook_urls(webhook_urls or "") or None
        if email:
            self._validate_email(email)
        if not email and not webhooks:
            raise SubscriptionValidationError("请至少填写收件邮箱或 Webhook 地址")
        return email, webhooks

    def get_profile(self, user_id: int) -> Dict[str, Any]:
        db = DatabaseManager.get_instance()
        row = db.get_notification_profile(user_id)
        return self._serialize_profile(row)

    def save_profile(
        self,
        user_id: int,
        *,
        notification_email: Optional[str],
        webhook_urls: Optional[str],
        webhook_bearer_token: Optional[str] = None,
        clear_bearer_token: bool = False,
    ) -> Dict[str, Any]:
        email, webhooks = self._validate_notification_profile(notification_email, webhook_urls)
        db = DatabaseManager.get_instance()
        row = db.upsert_notification_profile(
            user_id,
            notification_email=email,
            webhook_urls=webhooks,
            webhook_bearer_token=webhook_bearer_token,
            clear_bearer_token=clear_bearer_token,
        )
        return self._serialize_profile(row)

    def list_subscriptions(self, user_id: int) -> Dict[str, Any]:
        db = DatabaseManager.get_instance()
        rows = db.list_stock_subscriptions(user_id)
        active_count = sum(1 for row in rows if row.status == "active")
        return {
            "items": [self._serialize_subscription(row) for row in rows],
            "total": len(rows),
            "active_count": active_count,
        }

    def get_pricing(self) -> Dict[str, int]:
        credits_per_push = self.get_credits_per_push()
        trading_days = self.get_trading_days_per_month()
        return {
            "credits_per_push": credits_per_push,
            "trading_days_per_month": trading_days,
            "estimated_monthly_by_interval": {
                str(days): credits_per_push * max(1, trading_days // days)
                for days in sorted(ALLOWED_INTERVAL_DAYS)
            },
        }

    def create_subscription(
        self,
        user_id: int,
        *,
        code: str,
        name: Optional[str],
        interval_days: int,
    ) -> Dict[str, Any]:
        if interval_days not in ALLOWED_INTERVAL_DAYS:
            raise SubscriptionValidationError("推送间隔仅支持 1、3、5 个交易日")

        normalized_code = canonical_stock_code(code)
        if not normalized_code:
            raise SubscriptionValidationError("股票代码不能为空")

        db = DatabaseManager.get_instance()
        if db.count_stock_subscriptions(user_id) >= self.get_max_subscriptions_per_user():
            raise SubscriptionValidationError("订阅数量已达上限")

        existing = db.list_stock_subscriptions(user_id)
        if any(row.code == normalized_code for row in existing):
            raise SubscriptionValidationError("该股票已在订阅列表中")

        market = get_market_for_stock(normalized_code) or "cn"
        display_name = (name or "").strip() or STOCK_NAME_MAP.get(normalized_code, "")
        anchor_date = get_effective_trading_date(market)
        next_push_on = anchor_date
        credits_per_push = self.get_credits_per_push()

        row = db.create_stock_subscription(
            user_id=user_id,
            code=normalized_code,
            name=display_name or None,
            market=market,
            interval_days=interval_days,
            anchor_date=anchor_date,
            next_push_on=next_push_on,
            credits_per_push=credits_per_push,
        )
        return self._serialize_subscription(row)

    def update_subscription(
        self,
        user_id: int,
        subscription_id: int,
        *,
        interval_days: Optional[int] = None,
        status: Optional[str] = None,
    ) -> Dict[str, Any]:
        db = DatabaseManager.get_instance()
        row = db.get_stock_subscription(user_id, subscription_id)
        if row is None:
            raise SubscriptionValidationError("订阅不存在")

        updates: Dict[str, Any] = {}
        if interval_days is not None:
            if interval_days not in ALLOWED_INTERVAL_DAYS:
                raise SubscriptionValidationError("推送间隔仅支持 1、3、5 个交易日")
            updates["interval_days"] = interval_days
            base_date = row.last_pushed_on or row.anchor_date
            updates["next_push_on"] = add_trading_days(row.market, base_date, interval_days)

        if status is not None:
            normalized_status = status.strip().lower()
            if normalized_status not in {"active", "paused"}:
                raise SubscriptionValidationError("状态仅支持 active 或 paused")
            updates["status"] = normalized_status
            if normalized_status == "active" and row.next_push_on is None:
                updates["next_push_on"] = get_effective_trading_date(row.market)

        updated = db.update_stock_subscription(subscription_id, user_id, **updates)
        if updated is None:
            raise SubscriptionValidationError("订阅不存在")
        return self._serialize_subscription(updated)

    def delete_subscription(self, user_id: int, subscription_id: int) -> None:
        db = DatabaseManager.get_instance()
        if not db.delete_stock_subscription(subscription_id, user_id):
            raise SubscriptionValidationError("订阅不存在")

    @staticmethod
    def _serialize_profile(row: Optional[UserNotificationProfile]) -> Dict[str, Any]:
        if row is None:
            return {
                "notification_email": "",
                "webhook_urls": "",
                "has_webhook_bearer_token": False,
            }
        return {
            "notification_email": row.notification_email or "",
            "webhook_urls": row.webhook_urls or "",
            "has_webhook_bearer_token": bool((row.webhook_bearer_token or "").strip()),
        }

    def _serialize_subscription(self, row: StockSubscription) -> Dict[str, Any]:
        interval = int(row.interval_days)
        monthly_estimate = self.get_credits_per_push() * max(
            1, self.get_trading_days_per_month() // max(interval, 1)
        )
        return {
            "id": int(row.id),
            "code": row.code,
            "name": row.name or "",
            "market": row.market,
            "interval_days": interval,
            "interval_label": self._interval_label(interval),
            "status": row.status,
            "anchor_date": row.anchor_date.isoformat() if row.anchor_date else None,
            "last_pushed_on": row.last_pushed_on.isoformat() if row.last_pushed_on else None,
            "next_push_on": row.next_push_on.isoformat() if row.next_push_on else None,
            "credits_per_push": int(row.credits_per_push),
            "estimated_monthly_credits": monthly_estimate,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }

    @staticmethod
    def _interval_label(interval_days: int) -> str:
        mapping = {1: "每天", 3: "每3天", 5: "每5天"}
        return mapping.get(interval_days, f"每{interval_days}天")

    def list_push_logs(self, user_id: int, limit: int = 20) -> List[Dict[str, Any]]:
        db = DatabaseManager.get_instance()
        rows = db.list_subscription_push_logs(user_id, limit=limit)
        return [self._serialize_push_log(row) for row in rows]

    @staticmethod
    def _serialize_push_log(row) -> Dict[str, Any]:
        return {
            "id": int(row.id),
            "subscription_id": int(row.subscription_id),
            "code": row.code,
            "pushed_on": row.pushed_on.isoformat() if row.pushed_on else None,
            "channel": row.channel,
            "status": row.status,
            "credits_charged": int(row.credits_charged or 0),
            "error_message": row.error_message or "",
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
