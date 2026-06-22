# -*- coding: utf-8 -*-
"""Public report share API schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from api.v1.schemas.history import AnalysisReport


class ReportShareLinkResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    history_id: int = Field(alias="historyId")
    share_token: str = Field(alias="shareToken")
    share_path: str = Field(alias="sharePath")
    enabled: bool = True
    created_at: str | None = Field(default=None, alias="createdAt")


class PublicSharedReportResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    share_token: str = Field(alias="shareToken")
    share_path: str = Field(alias="sharePath")
    report: AnalysisReport
    markdown: str
