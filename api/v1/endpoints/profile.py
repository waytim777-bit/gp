# -*- coding: utf-8 -*-
"""User profile endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from api.deps import get_current_user
from api.v1.schemas.profile import UpdateUserProfileRequest, UserProfileResponse
from src.auth import get_user_profile, update_user_profile
from src.user_context import CurrentUser

router = APIRouter(prefix="/profile", tags=["Profile"])


@router.get("", response_model=UserProfileResponse, summary="Get current user profile")
def get_profile(current_user: CurrentUser = Depends(get_current_user)) -> UserProfileResponse:
    if current_user.account_type == "admin":
        return UserProfileResponse.model_validate({
            "id": int(current_user.id),
            "username": str(current_user.username),
            "avatarUrl": None,
            "accountType": "admin",
            "isAdmin": True,
        })

    payload = get_user_profile(int(current_user.id))
    if payload is None:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": "用户不存在"})
    return UserProfileResponse.model_validate(payload)


@router.patch("", response_model=UserProfileResponse, summary="Update current user profile")
def patch_profile(
    body: UpdateUserProfileRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> UserProfileResponse:
    if current_user.account_type == "admin":
        raise HTTPException(
            status_code=400,
            detail={"error": "admin_profile_readonly", "message": "管理员账号不支持修改昵称或头像"},
        )

    if body.username is None and body.avatar_url is None and not body.clear_avatar:
        raise HTTPException(
            status_code=400,
            detail={"error": "no_changes", "message": "没有可更新的内容"},
        )

    payload, err = update_user_profile(
        int(current_user.id),
        username=body.username,
        avatar_url=body.avatar_url,
        clear_avatar=body.clear_avatar,
    )
    if err:
        raise HTTPException(status_code=400, detail={"error": "invalid_profile", "message": err})
    if payload is None:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": "用户不存在"})
    return UserProfileResponse.model_validate(payload)
