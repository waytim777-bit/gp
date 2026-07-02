# -*- coding: utf-8 -*-
"""Short-lived signed tokens for internal report print rendering."""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Optional

_FALLBACK_SECRET = secrets.token_urlsafe(32).encode("utf-8")
_TTL_SECONDS = 120


def _secret() -> bytes:
    configured = (os.getenv("REPORT_PRINT_TOKEN_SECRET") or "").strip()
    if configured:
        return configured.encode("utf-8")

    try:
        from src.auth import _get_session_secret

        session_secret = _get_session_secret()
        if session_secret:
            return session_secret
    except Exception:
        pass

    return _FALLBACK_SECRET


def create_report_print_token(record_id: str, owner_user_id: Optional[int]) -> str:
    body = {
        "rid": str(record_id),
        "uid": owner_user_id,
        "exp": int(time.time()) + _TTL_SECONDS,
    }
    payload = base64.urlsafe_b64encode(
        json.dumps(body, separators=(",", ":")).encode("utf-8")
    ).decode("ascii").rstrip("=")
    sig = hmac.new(_secret(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def verify_report_print_token(token: str, record_id: str) -> Optional[int]:
    parts = (token or "").split(".")
    if len(parts) != 2:
        return None
    payload, sig = parts
    expected = hmac.new(_secret(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        padded = payload + ("=" * (-len(payload) % 4))
        body = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
    except Exception:
        return None
    if str(body.get("rid") or "") != str(record_id):
        return None
    if int(body.get("exp") or 0) < int(time.time()):
        return None
    uid = body.get("uid")
    return int(uid) if uid is not None else None
