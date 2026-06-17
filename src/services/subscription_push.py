# -*- coding: utf-8 -*-
"""Deliver subscription reports to per-user email / webhook destinations."""

from __future__ import annotations

import logging
from dataclasses import replace
from typing import Optional, Tuple

from src.config import Config
from src.notification_sender.custom_webhook_sender import CustomWebhookSender
from src.notification_sender.email_sender import EmailSender

logger = logging.getLogger(__name__)


def _split_webhook_urls(raw: Optional[str]) -> list[str]:
    return [item.strip() for item in (raw or "").split(",") if item.strip()]


def deliver_subscription_report(
    *,
    content: str,
    platform_config: Config,
    notification_email: Optional[str],
    webhook_urls: Optional[str],
    webhook_bearer_token: Optional[str] = None,
) -> Tuple[bool, str]:
    """
    Push a subscription report using platform SMTP + user-specific destinations.

    Returns:
        (success, channel_summary)
    """
    email = (notification_email or "").strip()
    webhooks = _split_webhook_urls(webhook_urls)
    if not email and not webhooks:
        return False, "none"

    email_ok = False
    webhook_ok = False

    if email:
        if not platform_config.email_sender or not platform_config.email_password:
            logger.warning("平台未配置 SMTP，无法向 %s 发送订阅邮件", email)
        else:
            email_config = replace(platform_config, email_receivers=[email])
            try:
                email_ok = EmailSender(email_config).send_to_email(content, receivers=[email])
            except Exception as exc:
                logger.error("订阅邮件推送失败 (%s): %s", email, exc, exc_info=True)

    if webhooks:
        webhook_config = replace(
            platform_config,
            custom_webhook_urls=webhooks,
            custom_webhook_bearer_token=webhook_bearer_token or "",
        )
        try:
            webhook_ok = CustomWebhookSender(webhook_config).send_to_custom(content)
        except Exception as exc:
            logger.error("订阅 Webhook 推送失败: %s", exc, exc_info=True)

    if email_ok and webhook_ok:
        return True, "both"
    if email_ok:
        return True, "email"
    if webhook_ok:
        return True, "webhook"
    if email and webhooks:
        return False, "both"
    if email:
        return False, "email"
    return False, "webhook"
