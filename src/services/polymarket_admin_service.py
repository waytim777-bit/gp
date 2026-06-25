# -*- coding: utf-8 -*-
"""Admin service for Polymarket watchlist CRUD and live preview."""

from __future__ import annotations

import threading
from typing import Any, Dict, List, Optional

from src.services.polymarket_gamma_service import PolymarketGammaError, PolymarketGammaService
from src.storage import DatabaseManager, PolymarketWatchItem

_VALID_SLUG_TYPES = {"event", "market"}


class PolymarketAdminService:
    _instance: Optional["PolymarketAdminService"] = None
    _instance_lock = threading.Lock()

    def __init__(self) -> None:
        self._db = DatabaseManager.get_instance()
        self._gamma = PolymarketGammaService.get_instance()

    @classmethod
    def get_instance(cls) -> "PolymarketAdminService":
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def list_watch_items(self, *, enabled_only: bool = False) -> List[Dict[str, Any]]:
        rows = self._db.list_polymarket_watch_items(enabled_only=enabled_only)
        return [self._serialize_watch_item(row) for row in rows]

    def create_watch_item(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        normalized = self._normalize_payload(payload, require_slug=True)
        row = self._db.create_polymarket_watch_item(**normalized)
        return self._serialize_watch_item(row)

    def update_watch_item(self, item_id: int, payload: Dict[str, Any]) -> Dict[str, Any]:
        kwargs: Dict[str, Any] = {}
        if "slugType" in payload or "slug_type" in payload:
            slug_type = str(payload.get("slugType") or payload.get("slug_type") or "").strip().lower()
            if slug_type not in _VALID_SLUG_TYPES:
                raise ValueError("slug_type 仅支持 event 或 market")
            kwargs["slug_type"] = slug_type
        if "slug" in payload:
            slug = str(payload.get("slug") or "").strip()
            if not slug:
                raise ValueError("slug 不能为空")
            kwargs["slug"] = slug
        if "label" in payload:
            kwargs["label"] = str(payload.get("label") or "").strip()
        if "category" in payload:
            kwargs["category"] = str(payload.get("category") or "macro").strip() or "macro"
        if "enabled" in payload:
            kwargs["enabled"] = bool(payload.get("enabled"))
        if "priority" in payload:
            kwargs["priority"] = int(payload.get("priority") or 100)
        if "marketSlug" in payload or "market_slug" in payload:
            kwargs["market_slug"] = str(payload.get("marketSlug") or payload.get("market_slug") or "").strip() or None
        if "outcomeLabel" in payload or "outcome_label" in payload:
            kwargs["outcome_label"] = (
                str(payload.get("outcomeLabel") or payload.get("outcome_label") or "Yes").strip() or "Yes"
            )
        if "minVolume24h" in payload or "min_volume_24h" in payload:
            kwargs["min_volume_24h"] = self._optional_float(
                payload.get("minVolume24h", payload.get("min_volume_24h"))
            )
        if "minLiquidity" in payload or "min_liquidity" in payload:
            kwargs["min_liquidity"] = self._optional_float(
                payload.get("minLiquidity", payload.get("min_liquidity"))
            )
        if "notes" in payload:
            kwargs["notes"] = str(payload.get("notes") or "").strip() or None
        kwargs.update(
            clear_market_slug=bool(payload.get("clearMarketSlug")),
            clear_min_volume_24h=bool(payload.get("clearMinVolume24h")),
            clear_min_liquidity=bool(payload.get("clearMinLiquidity")),
            clear_notes=bool(payload.get("clearNotes")),
        )
        row = self._db.update_polymarket_watch_item(item_id, **kwargs)
        if row is None:
            raise KeyError(f"watch item not found: {item_id}")
        return self._serialize_watch_item(row)

    def delete_watch_item(self, item_id: int) -> None:
        if not self._db.delete_polymarket_watch_item(item_id):
            raise KeyError(f"watch item not found: {item_id}")

    def preview_by_slug(
        self,
        *,
        slug_type: str,
        slug: str,
        market_slug: Optional[str] = None,
        outcome_label: str = "Yes",
    ) -> Dict[str, Any]:
        return self._gamma.preview(
            slug_type=slug_type,
            slug=slug,
            market_slug=market_slug,
            outcome_label=outcome_label,
        )

    def preview_watch_item(self, item_id: int) -> Dict[str, Any]:
        row = self._db.get_polymarket_watch_item(item_id)
        if row is None:
            raise KeyError(f"watch item not found: {item_id}")
        preview = self.preview_by_slug(
            slug_type=row.slug_type,
            slug=row.slug,
            market_slug=row.market_slug,
            outcome_label=row.outcome_label,
        )
        preview["watchItem"] = self._serialize_watch_item(row)
        return preview

    def _normalize_payload(
        self,
        payload: Dict[str, Any],
        *,
        require_slug: bool,
    ) -> Dict[str, Any]:
        slug_type = str(payload.get("slugType") or payload.get("slug_type") or "event").strip().lower()
        if slug_type not in _VALID_SLUG_TYPES:
            raise ValueError("slug_type 仅支持 event 或 market")

        slug = str(payload.get("slug") or "").strip()
        if require_slug and not slug:
            raise ValueError("slug 不能为空")

        normalized: Dict[str, Any] = {
            "slug_type": slug_type,
            "label": str(payload.get("label") or "").strip(),
            "category": str(payload.get("category") or "macro").strip() or "macro",
            "enabled": bool(payload.get("enabled", True)),
            "priority": int(payload.get("priority") or 100),
            "outcome_label": str(payload.get("outcomeLabel") or payload.get("outcome_label") or "Yes").strip() or "Yes",
        }
        if slug or require_slug:
            normalized["slug"] = slug
        market_slug = payload.get("marketSlug", payload.get("market_slug"))
        if market_slug is not None:
            normalized["market_slug"] = str(market_slug).strip() or None
        if "minVolume24h" in payload or "min_volume_24h" in payload:
            normalized["min_volume_24h"] = self._optional_float(
                payload.get("minVolume24h", payload.get("min_volume_24h"))
            )
        if "minLiquidity" in payload or "min_liquidity" in payload:
            normalized["min_liquidity"] = self._optional_float(
                payload.get("minLiquidity", payload.get("min_liquidity"))
            )
        if "notes" in payload:
            normalized["notes"] = str(payload.get("notes") or "").strip() or None
        return normalized

    @staticmethod
    def _optional_float(value: Any) -> Optional[float]:
        if value is None or value == "":
            return None
        return float(value)

    @staticmethod
    def _serialize_watch_item(row: PolymarketWatchItem) -> Dict[str, Any]:
        return {
            "id": row.id,
            "slugType": row.slug_type,
            "slug": row.slug,
            "label": row.label,
            "category": row.category,
            "enabled": row.enabled,
            "priority": row.priority,
            "marketSlug": row.market_slug,
            "outcomeLabel": row.outcome_label,
            "minVolume24h": row.min_volume_24h,
            "minLiquidity": row.min_liquidity,
            "notes": row.notes,
            "createdAt": row.created_at.isoformat(timespec="seconds") if row.created_at else None,
            "updatedAt": row.updated_at.isoformat(timespec="seconds") if row.updated_at else None,
        }


def is_polymarket_gamma_error(exc: Exception) -> bool:
    return isinstance(exc, PolymarketGammaError)
