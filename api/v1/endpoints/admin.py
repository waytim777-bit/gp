# -*- coding: utf-8 -*-
"""Admin management endpoints."""

from __future__ import annotations

import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError

from api.deps import get_database_manager, require_admin, get_current_user
from api.v1.endpoints import admin_subscription_push, admin_prediction_reports
from src.permissions import get_menu_items, get_setting_items
from src.storage import DatabaseManager
from src.user_context import CurrentUser

router = APIRouter()

router.include_router(admin_subscription_push.router)
router.include_router(admin_prediction_reports.router)

ROLE_KEY_RE = re.compile(r"^[a-z][a-z0-9_-]{1,31}$")


class RolePayload(BaseModel):
    id: int
    key: str
    name: str
    description: str = ""
    is_system: bool = Field(alias="isSystem")
    menu_keys: List[str] = Field(default_factory=list, alias="menuKeys")
    setting_keys: List[str] = Field(default_factory=list, alias="settingKeys")
    created_at: Optional[str] = Field(default=None, alias="createdAt")
    updated_at: Optional[str] = Field(default=None, alias="updatedAt")

    model_config = {"populate_by_name": True}


class UserPayload(BaseModel):
    id: int
    username: str
    is_admin: bool = Field(alias="isAdmin")
    is_active: bool = Field(alias="isActive")
    role: RolePayload | dict
    credit_balance: int = Field(default=0, alias="creditBalance")
    lifetime_credits: int = Field(default=0, alias="lifetimeCredits")
    created_at: Optional[str] = Field(default=None, alias="createdAt")
    updated_at: Optional[str] = Field(default=None, alias="updatedAt")

    model_config = {"populate_by_name": True}


class MenuItemPayload(BaseModel):
    key: str
    label: str
    path: str


class SettingItemPayload(BaseModel):
    key: str
    label: str
    category: str
    category_label: str = Field(alias="categoryLabel")
    category_order: int = Field(alias="categoryOrder")
    display_order: int = Field(alias="displayOrder")

    model_config = {"populate_by_name": True}


class CreateRoleRequest(BaseModel):
    model_config = {"populate_by_name": True}

    key: str = Field(..., min_length=2, max_length=32)
    name: str = Field(..., min_length=1, max_length=64)
    description: str = Field(default="", max_length=256)
    menu_keys: List[str] = Field(default_factory=list, alias="menuKeys")
    setting_keys: List[str] = Field(default_factory=list, alias="settingKeys")


class UpdateRoleRequest(BaseModel):
    model_config = {"populate_by_name": True}

    name: Optional[str] = Field(default=None, min_length=1, max_length=64)
    description: Optional[str] = Field(default=None, max_length=256)
    menu_keys: Optional[List[str]] = Field(default=None, alias="menuKeys")
    setting_keys: Optional[List[str]] = Field(default=None, alias="settingKeys")


class AssignRoleRequest(BaseModel):
    role_id: int = Field(alias="roleId")

    model_config = {"populate_by_name": True}


class UpdateUserStatusRequest(BaseModel):
    is_active: bool = Field(alias="isActive")

    model_config = {"populate_by_name": True}


class AdjustUserCreditsRequest(BaseModel):
    """Admin credit adjustment request."""

    delta: int = Field(..., description="积分增减值，可为负数")
    reason: str = Field(default="", max_length=200, description="调整原因（可选）")

    model_config = {"populate_by_name": True}


class AdjustUserCreditsResponse(BaseModel):
    user_id: int = Field(alias="userId")
    applied_delta: int = Field(alias="appliedDelta")
    balance: int
    lifetime_credits: int = Field(alias="lifetimeCredits")

    model_config = {"populate_by_name": True}

@router.get("/menus", response_model=list[MenuItemPayload])
def list_menus(_admin: None = Depends(require_admin())):
    return get_menu_items()


@router.get("/settings", response_model=list[SettingItemPayload])
def list_settings(_admin: None = Depends(require_admin())):
    return get_setting_items()


@router.get("/roles", response_model=list[RolePayload])
def list_roles(
    db: DatabaseManager = Depends(get_database_manager),
    _admin: None = Depends(require_admin()),
):
    return db.list_roles()


@router.post("/roles", response_model=RolePayload)
def create_role(
    request: CreateRoleRequest,
    db: DatabaseManager = Depends(get_database_manager),
    _admin: None = Depends(require_admin()),
):
    key = request.key.strip().lower()
    if not ROLE_KEY_RE.fullmatch(key):
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_role_key",
                "message": "角色 key 只能包含小写字母、数字、下划线和短横线，且必须以字母开头",
            },
        )
    try:
        return db.create_role_record(
            key=key,
            name=request.name,
            description=request.description,
            menu_keys=request.menu_keys,
            setting_keys=request.setting_keys,
        )
    except IntegrityError:
        raise HTTPException(
            status_code=409,
            detail={"error": "role_exists", "message": "角色 key 已存在"},
        )


@router.put("/roles/{role_id}", response_model=RolePayload)
def update_role(
    role_id: int,
    request: UpdateRoleRequest,
    db: DatabaseManager = Depends(get_database_manager),
    _admin: None = Depends(require_admin()),
):
    role = db.update_role_record(
        role_id,
        name=request.name,
        description=request.description,
        menu_keys=request.menu_keys,
        setting_keys=request.setting_keys,
    )
    if role is None:
        raise HTTPException(status_code=404, detail={"error": "role_not_found", "message": "角色不存在"})
    return role


@router.delete("/roles/{role_id}", status_code=204)
def delete_role(
    role_id: int,
    db: DatabaseManager = Depends(get_database_manager),
    _admin: None = Depends(require_admin()),
):
    try:
        db.delete_role_record(role_id)
    except ValueError as exc:
        code = str(exc)
        status = 404 if code == "role_not_found" else 400
        messages = {
            "role_not_found": "角色不存在",
            "system_role_not_deletable": "内置角色不能删除",
            "role_in_use": "该角色已有用户使用，不能删除",
        }
        raise HTTPException(
            status_code=status,
            detail={"error": code, "message": messages.get(code, code)},
        )
    return None


@router.get("/users", response_model=list[UserPayload])
def list_users(
    db: DatabaseManager = Depends(get_database_manager),
    _admin: None = Depends(require_admin()),
):
    return db.list_user_accounts()


@router.patch("/users/{user_id}/role", response_model=UserPayload)
def assign_user_role(
    user_id: int,
    request: AssignRoleRequest,
    db: DatabaseManager = Depends(get_database_manager),
    _admin: None = Depends(require_admin()),
):
    try:
        user = db.assign_user_role(user_id, request.role_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": str(exc), "message": "admin 用户不能被降权"},
        )
    if user is None:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": "用户或角色不存在"})
    return user


@router.patch("/users/{user_id}/status", response_model=UserPayload)
def update_user_status(
    user_id: int,
    request: UpdateUserStatusRequest,
    db: DatabaseManager = Depends(get_database_manager),
    _admin: None = Depends(require_admin()),
):
    try:
        user = db.set_user_active(user_id, request.is_active)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": str(exc), "message": "admin 用户不能被禁用"},
        )
    if user is None:
        raise HTTPException(status_code=404, detail={"error": "user_not_found", "message": "用户不存在"})
    return user


@router.post("/users/{user_id}/credits:adjust", response_model=AdjustUserCreditsResponse)
def adjust_user_credits(
    user_id: int,
    request: AdjustUserCreditsRequest,
    db: DatabaseManager = Depends(get_database_manager),
    current_user: CurrentUser = Depends(get_current_user),
    _admin: None = Depends(require_admin()),
):
    """Admin: adjust user's credit balance by delta."""
    delta = int(request.delta)
    if delta == 0:
        raise HTTPException(status_code=400, detail={"error": "invalid_delta", "message": "delta 不能为 0"})
    payload = db.adjust_user_credits(
        user_id=int(user_id),
        delta=delta,
        operator_user_id=int(current_user.id),
        reason=(request.reason or "").strip() or None,
    )
    return AdjustUserCreditsResponse(
        userId=int(user_id),
        appliedDelta=int(payload.get("applied_delta", 0)),
        balance=int(payload.get("balance", 0)),
        lifetimeCredits=int(payload.get("lifetime_credits", 0)),
    )
