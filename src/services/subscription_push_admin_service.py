# -*- coding: utf-8 -*-
"""Admin-facing subscription push overview and orchestration helpers."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from src.services.subscription_runner import SubscriptionRunner
from src.storage import (
    DatabaseManager,
    StockSubscription,
    SubscriptionPushLog,
    User,
    UserCreditBalance,
    UserNotificationProfile,
)

logger = logging.getLogger(__name__)

_INTERVAL_LABELS = {1: "每天", 3: "每3天", 5: "每5天"}


class SubscriptionPushAdminService:
    _instance: Optional["SubscriptionPushAdminService"] = None

    @classmethod
    def get_instance(cls) -> "SubscriptionPushAdminService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def get_overview(self, *, log_limit: int = 50) -> Dict[str, Any]:
        """Return overview payload using camelCase keys for dsa-admin."""
        db = DatabaseManager.get_instance()
        runner = SubscriptionRunner.get_instance()
        due_ids = {int(row.id) for row in runner.collect_due_subscriptions()}
        latest_log_by_sub = self._latest_push_log_by_subscription(db)

        rows: List[Dict[str, Any]] = []
        with db.get_session() as session:
            subscriptions = session.execute(
                select(StockSubscription).order_by(
                    StockSubscription.user_id.asc(),
                    StockSubscription.code.asc(),
                    StockSubscription.id.asc(),
                )
            ).scalars().all()

            if subscriptions:
                user_ids = sorted({int(row.user_id) for row in subscriptions})
                users = session.execute(select(User).where(User.id.in_(user_ids))).scalars().all()
                user_map = {int(user.id): user for user in users}

                profiles = session.execute(
                    select(UserNotificationProfile).where(UserNotificationProfile.user_id.in_(user_ids))
                ).scalars().all()
                profile_map = {int(row.user_id): row for row in profiles}

                balances = session.execute(
                    select(UserCreditBalance).where(UserCreditBalance.user_id.in_(user_ids))
                ).scalars().all()
                balance_map = {int(row.user_id): int(row.balance or 0) for row in balances}

                for sub in subscriptions:
                    user = user_map.get(int(sub.user_id))
                    profile = profile_map.get(int(sub.user_id))
                    latest_log = latest_log_by_sub.get(int(sub.id))
                    webhook_urls = (profile.webhook_urls if profile else "") or ""
                    rows.append(
                        self._serialize_overview_row(
                            sub=sub,
                            user=user,
                            credit_balance=balance_map.get(int(sub.user_id), 0),
                            notification_email=(profile.notification_email if profile else "") or "",
                            has_webhook=bool(webhook_urls.strip()),
                            is_due_today=int(sub.id) in due_ids,
                            latest_log=latest_log,
                        )
                    )

        active_count = sum(1 for row in rows if row["status"] == "active")
        due_count = sum(1 for row in rows if row["isDueToday"])
        return {
            "rows": rows,
            "recentLogs": self._serialize_logs(db.list_all_subscription_push_logs(log_limit)),
            "stats": {
                "totalSubscriptions": len(rows),
                "activeSubscriptions": active_count,
                "dueToday": due_count,
            },
        }

    @staticmethod
    def _serialize_overview_row(
        *,
        sub: StockSubscription,
        user: Optional[User],
        credit_balance: int,
        notification_email: str,
        has_webhook: bool,
        is_due_today: bool,
        latest_log: Optional[SubscriptionPushLog],
    ) -> Dict[str, Any]:
        interval = int(sub.interval_days)
        return {
            "subscriptionId": int(sub.id),
            "userId": int(sub.user_id),
            "username": user.username if user is not None else f"user#{sub.user_id}",
            "isAdmin": bool(user.is_admin) if user is not None else False,
            "creditBalance": credit_balance,
            "notificationEmail": notification_email,
            "hasWebhook": has_webhook,
            "code": sub.code,
            "name": sub.name or "",
            "market": sub.market,
            "intervalDays": interval,
            "intervalLabel": _INTERVAL_LABELS.get(interval, f"每{interval}天"),
            "status": sub.status,
            "nextPushOn": sub.next_push_on.isoformat() if sub.next_push_on else None,
            "lastPushedOn": sub.last_pushed_on.isoformat() if sub.last_pushed_on else None,
            "creditsPerPush": int(sub.credits_per_push),
            "isDueToday": is_due_today,
            "lastPushStatus": latest_log.status if latest_log is not None else None,
            "lastPushAt": latest_log.created_at.isoformat() if latest_log and latest_log.created_at else None,
            "lastPushError": (latest_log.error_message if latest_log else "") or "",
        }

    def preview_due_today(self) -> Dict[str, Any]:
        return SubscriptionRunner.get_instance().preview_due_today()

    def analyze_due(self, codes: Optional[List[str]] = None) -> Dict[str, Any]:
        return SubscriptionRunner.get_instance().analyze_due(codes=codes)

    def deliver_due(self, codes: Optional[List[str]] = None) -> Dict[str, Any]:
        return SubscriptionRunner.get_instance().deliver_due(codes=codes)

    @staticmethod
    def _latest_push_log_by_subscription(db: DatabaseManager) -> Dict[int, SubscriptionPushLog]:
        logs = db.list_all_subscription_push_logs(limit=500)
        latest: Dict[int, SubscriptionPushLog] = {}
        for row in logs:
            sub_id = int(row.subscription_id)
            if sub_id not in latest:
                latest[sub_id] = row
        return latest

    @staticmethod
    def _serialize_logs(rows: List[SubscriptionPushLog]) -> List[Dict[str, Any]]:
        db = DatabaseManager.get_instance()
        usernames: Dict[int, str] = {}
        serialized: List[Dict[str, Any]] = []
        for row in rows:
            user_id = int(row.user_id)
            if user_id not in usernames:
                with db.get_session() as session:
                    user = session.execute(
                        select(User).where(User.id == user_id).limit(1)
                    ).scalar_one_or_none()
                    usernames[user_id] = user.username if user is not None else f"user#{user_id}"
            serialized.append({
                "id": int(row.id),
                "subscriptionId": int(row.subscription_id),
                "userId": user_id,
                "username": usernames[user_id],
                "code": row.code,
                "pushedOn": row.pushed_on.isoformat() if row.pushed_on else None,
                "channel": row.channel,
                "status": row.status,
                "creditsCharged": int(row.credits_charged or 0),
                "errorMessage": row.error_message or "",
                "createdAt": row.created_at.isoformat() if row.created_at else None,
            })
        return serialized
