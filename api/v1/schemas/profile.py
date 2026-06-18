# -*- coding: utf-8 -*-
"""User profile API schemas."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class UserProfileResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    username: str
    avatar_url: Optional[str] = Field(default=None, alias="avatarUrl")
    account_type: str = Field(alias="accountType")
    is_admin: bool = Field(alias="isAdmin")


class UpdateUserProfileRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    username: Optional[str] = None
    avatar_url: Optional[str] = Field(default=None, alias="avatarUrl")
    clear_avatar: bool = Field(default=False, alias="clearAvatar")
