# -*- coding: utf-8 -*-
"""Admin endpoints for Polymarket macro watchlist management."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import IntegrityError

from api.deps import require_admin
from src.services.polymarket_admin_service import PolymarketAdminService
from src.services.polymarket_gamma_service import PolymarketGammaError

router = APIRouter(prefix="/polymarket", tags=["Admin Polymarket"])


def _service() -> PolymarketAdminService:
    return PolymarketAdminService.get_instance()


class WatchItemPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    slug_type: str = Field(alias="slugType")
    slug: str
    label: str = ""
    category: str = "macro"
    enabled: bool = True
    priority: int = 100
    market_slug: Optional[str] = Field(default=None, alias="marketSlug")
    outcome_label: str = Field(default="Yes", alias="outcomeLabel")
    min_volume_24h: Optional[float] = Field(default=None, alias="minVolume24h")
    min_liquidity: Optional[float] = Field(default=None, alias="minLiquidity")
    notes: Optional[str] = None
    created_at: Optional[str] = Field(default=None, alias="createdAt")
    updated_at: Optional[str] = Field(default=None, alias="updatedAt")


class WatchlistResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    items: List[WatchItemPayload]


class CreateWatchItemRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    slug_type: str = Field(default="event", alias="slugType")
    slug: str
    label: str = ""
    category: str = "macro"
    enabled: bool = True
    priority: int = 100
    market_slug: Optional[str] = Field(default=None, alias="marketSlug")
    outcome_label: str = Field(default="Yes", alias="outcomeLabel")
    min_volume_24h: Optional[float] = Field(default=None, alias="minVolume24h")
    min_liquidity: Optional[float] = Field(default=None, alias="minLiquidity")
    notes: Optional[str] = None


class UpdateWatchItemRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    slug_type: Optional[str] = Field(default=None, alias="slugType")
    slug: Optional[str] = None
    label: Optional[str] = None
    category: Optional[str] = None
    enabled: Optional[bool] = None
    priority: Optional[int] = None
    market_slug: Optional[str] = Field(default=None, alias="marketSlug")
    outcome_label: Optional[str] = Field(default=None, alias="outcomeLabel")
    min_volume_24h: Optional[float] = Field(default=None, alias="minVolume24h")
    min_liquidity: Optional[float] = Field(default=None, alias="minLiquidity")
    notes: Optional[str] = None
    clear_market_slug: bool = Field(default=False, alias="clearMarketSlug")
    clear_min_volume_24h: bool = Field(default=False, alias="clearMinVolume24h")
    clear_min_liquidity: bool = Field(default=False, alias="clearMinLiquidity")
    clear_notes: bool = Field(default=False, alias="clearNotes")


class OutcomePayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    label: str
    price: Optional[float] = None
    probability_pct: Optional[float] = Field(default=None, alias="probabilityPct")


class MarketPreviewPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    slug: str = ""
    question: str = ""
    outcomes: List[OutcomePayload] = Field(default_factory=list)
    volume24h: Optional[float] = None
    liquidity: Optional[float] = None
    active: bool = True
    closed: bool = False


class PreviewResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    slug_type: str = Field(alias="slugType")
    slug: str
    title: str = ""
    question: str = ""
    markets: List[MarketPreviewPayload] = Field(default_factory=list)
    selected_market: Optional[MarketPreviewPayload] = Field(default=None, alias="selectedMarket")
    selected_outcome: Optional[OutcomePayload] = Field(default=None, alias="selectedOutcome")
    fetched_at: str = Field(alias="fetchedAt")
    watch_item: Optional[WatchItemPayload] = Field(default=None, alias="watchItem")


@router.get("/watchlist", response_model=WatchlistResponse)
def list_watchlist(
    enabled_only: bool = Query(default=False, alias="enabledOnly"),
    _admin: None = Depends(require_admin()),
) -> WatchlistResponse:
    del _admin
    items = _service().list_watch_items(enabled_only=enabled_only)
    return WatchlistResponse(items=[WatchItemPayload.model_validate(item) for item in items])


@router.post("/watchlist", response_model=WatchItemPayload)
def create_watch_item(
    request: CreateWatchItemRequest,
    _admin: None = Depends(require_admin()),
) -> WatchItemPayload:
    del _admin
    try:
        item = _service().create_watch_item(request.model_dump(by_alias=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"error": "invalid_request", "message": str(exc)}) from exc
    except IntegrityError as exc:
        raise HTTPException(
            status_code=409,
            detail={"error": "duplicate_slug", "message": "相同 slug_type + slug 已存在"},
        ) from exc
    return WatchItemPayload.model_validate(item)


@router.put("/watchlist/{item_id}", response_model=WatchItemPayload)
def update_watch_item(
    item_id: int,
    request: UpdateWatchItemRequest,
    _admin: None = Depends(require_admin()),
) -> WatchItemPayload:
    del _admin
    payload = request.model_dump(by_alias=True, exclude_none=True)
    try:
        item = _service().update_watch_item(item_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"error": "invalid_request", "message": str(exc)}) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": str(exc)}) from exc
    except IntegrityError as exc:
        raise HTTPException(
            status_code=409,
            detail={"error": "duplicate_slug", "message": "相同 slug_type + slug 已存在"},
        ) from exc
    return WatchItemPayload.model_validate(item)


@router.delete("/watchlist/{item_id}")
def delete_watch_item(
    item_id: int,
    _admin: None = Depends(require_admin()),
) -> Dict[str, Any]:
    del _admin
    try:
        _service().delete_watch_item(item_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": str(exc)}) from exc
    return {"success": True}


@router.get("/preview", response_model=PreviewResponse)
def preview_slug(
    slug_type: str = Query(alias="slugType"),
    slug: str = Query(),
    market_slug: Optional[str] = Query(default=None, alias="marketSlug"),
    outcome_label: str = Query(default="Yes", alias="outcomeLabel"),
    _admin: None = Depends(require_admin()),
) -> PreviewResponse:
    del _admin
    try:
        payload = _service().preview_by_slug(
            slug_type=slug_type,
            slug=slug,
            market_slug=market_slug,
            outcome_label=outcome_label,
        )
    except PolymarketGammaError as exc:
        raise HTTPException(status_code=502, detail={"error": "gamma_api_error", "message": str(exc)}) from exc
    return PreviewResponse.model_validate(payload)


@router.get("/preview/{item_id}", response_model=PreviewResponse)
def preview_watch_item(
    item_id: int,
    _admin: None = Depends(require_admin()),
) -> PreviewResponse:
    del _admin
    try:
        payload = _service().preview_watch_item(item_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": str(exc)}) from exc
    except PolymarketGammaError as exc:
        raise HTTPException(status_code=502, detail={"error": "gamma_api_error", "message": str(exc)}) from exc
    return PreviewResponse.model_validate(payload)
