# -*- coding: utf-8 -*-
"""Admin stock index maintenance endpoints."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from api.deps import require_admin
from src.services.stock_index_admin_service import (
    StockIndexAdminBusyError,
    StockIndexAdminService,
)

router = APIRouter(prefix="/stock-index", tags=["Admin Stock Index"])


def _service() -> StockIndexAdminService:
    return StockIndexAdminService.get_instance()


class FileInfoPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    exists: bool
    path: str = ""
    size_kb: Optional[float] = Field(default=None, alias="sizeKb")
    modified_at: Optional[str] = Field(default=None, alias="modifiedAt")


class IndexStatsPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    exists: bool = False
    total: int = 0
    markets: Dict[str, int] = Field(default_factory=dict)
    invalid: bool = False


class LookupResultPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    canonical_code: str = Field(alias="canonicalCode")
    display_code: str = Field(alias="displayCode")
    name_zh: str = Field(alias="nameZh")


class StockIndexStatusResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    index_public: FileInfoPayload = Field(alias="indexPublic")
    index_static: FileInfoPayload = Field(alias="indexStatic")
    active_index_path: Optional[str] = Field(default=None, alias="activeIndexPath")
    index_stats: IndexStatsPayload = Field(alias="indexStats")
    csv_files: Dict[str, FileInfoPayload] = Field(alias="csvFiles")
    tushare_token_configured: bool = Field(alias="tushareTokenConfigured")
    lookup_results: List[LookupResultPayload] = Field(default_factory=list, alias="lookupResults")


class StockIndexTaskResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    task: str
    success: bool
    exit_code: Optional[int] = Field(default=None, alias="exitCode")
    stdout: str = ""
    stderr: str = ""
    publish: Optional[Dict[str, Any]] = None
    status: StockIndexStatusResponse


@router.get("/status", response_model=StockIndexStatusResponse)
def get_stock_index_status(
    lookup: Optional[str] = Query(default=None, description="按代码或名称在索引中试查"),
    _admin: None = Depends(require_admin()),
) -> StockIndexStatusResponse:
    return StockIndexStatusResponse.model_validate(_service().get_status(lookup=lookup))


@router.post("/fetch-lists", response_model=StockIndexTaskResponse)
def fetch_stock_lists(_admin: None = Depends(require_admin())) -> StockIndexTaskResponse:
    try:
        return StockIndexTaskResponse.model_validate(_service().fetch_stock_lists())
    except StockIndexAdminBusyError as exc:
        raise HTTPException(status_code=409, detail={"error": "busy", "message": str(exc)}) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": str(exc)}) from exc


@router.post("/generate", response_model=StockIndexTaskResponse)
def generate_stock_index(
    test_mode: bool = Query(default=False, alias="testMode"),
    source: str = Query(default="tushare"),
    _admin: None = Depends(require_admin()),
) -> StockIndexTaskResponse:
    if source not in {"tushare", "akshare"}:
        raise HTTPException(status_code=400, detail={"error": "invalid_source", "message": "source 仅支持 tushare 或 akshare"})
    try:
        return StockIndexTaskResponse.model_validate(
            _service().generate_index(test_mode=test_mode, source=source),
        )
    except StockIndexAdminBusyError as exc:
        raise HTTPException(status_code=409, detail={"error": "busy", "message": str(exc)}) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": str(exc)}) from exc


@router.post("/publish", response_model=Dict[str, Any])
def publish_stock_index(_admin: None = Depends(require_admin())) -> Dict[str, Any]:
    try:
        return _service().publish_index()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": str(exc)}) from exc


@router.post("/build-web", response_model=StockIndexTaskResponse)
def build_web_frontend(_admin: None = Depends(require_admin())) -> StockIndexTaskResponse:
    try:
        return StockIndexTaskResponse.model_validate(_service().build_web_frontend())
    except StockIndexAdminBusyError as exc:
        raise HTTPException(status_code=409, detail={"error": "busy", "message": str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail={"error": "build_failed", "message": str(exc)}) from exc
