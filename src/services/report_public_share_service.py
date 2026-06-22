# -*- coding: utf-8 -*-
"""Public share-link service for analysis history reports."""

from __future__ import annotations

import logging
import threading
import uuid
from typing import Any, Dict, Optional

from src.services.history_report_builder import build_analysis_report
from src.services.history_service import HistoryService, MarkdownReportGenerationError
from src.storage import DatabaseManager

logger = logging.getLogger(__name__)


class ReportPublicShareError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


class ReportPublicShareService:
    _instance: Optional["ReportPublicShareService"] = None
    _lock = threading.Lock()

    @classmethod
    def get_instance(cls) -> "ReportPublicShareService":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @staticmethod
    def build_share_path(share_token: str) -> str:
        return f"/r/{share_token}"

    def get_share_link(
        self,
        *,
        owner_user_id: int,
        history_id: int,
    ) -> Optional[Dict[str, Any]]:
        db = DatabaseManager.get_instance()
        record = db.get_analysis_history_by_id(
            int(history_id),
            owner_user_id=int(owner_user_id),
            scoped=True,
        )
        if record is None or int(record.owner_user_id or 0) != int(owner_user_id):
            return None
        row = db.get_report_public_share_by_history_id(int(history_id))
        if row is None or not row.enabled:
            return None
        return self._serialize_share(row)

    def enable_share(
        self,
        *,
        owner_user_id: int,
        history_id: int,
    ) -> Dict[str, Any]:
        db = DatabaseManager.get_instance()
        record = db.get_analysis_history_by_id(
            int(history_id),
            owner_user_id=int(owner_user_id),
            scoped=True,
        )
        if record is None:
            raise ReportPublicShareError("not_found", "报告不存在")
        if int(record.owner_user_id or 0) != int(owner_user_id):
            raise ReportPublicShareError("forbidden", "无权分享该报告")

        existing = db.get_report_public_share_by_history_id(int(history_id))
        token = existing.share_token if existing and existing.share_token else uuid.uuid4().hex
        row = db.upsert_report_public_share(
            analysis_history_id=int(history_id),
            owner_user_id=int(owner_user_id),
            share_token=token,
        )
        logger.info(
            "Report public share enabled: history=%s user=%s token=%s",
            history_id,
            owner_user_id,
            row.share_token,
        )
        return self._serialize_share(row)

    def revoke_share(
        self,
        *,
        owner_user_id: int,
        history_id: int,
    ) -> bool:
        db = DatabaseManager.get_instance()
        return db.revoke_report_public_share(
            analysis_history_id=int(history_id),
            owner_user_id=int(owner_user_id),
        )

    def get_public_report(self, share_token: str) -> Dict[str, Any]:
        db = DatabaseManager.get_instance()
        row = db.get_report_public_share_by_token(share_token)
        if row is None:
            raise ReportPublicShareError("not_found", "分享链接无效或已失效")

        history_service = HistoryService(db)
        detail = history_service.resolve_and_get_detail(
            str(row.analysis_history_id),
            owner_user_id=int(row.owner_user_id),
        )
        if detail is None:
            raise ReportPublicShareError("not_found", "报告不存在或已删除")

        report = build_analysis_report(
            detail,
            db,
            owner_user_id=int(row.owner_user_id),
        )
        markdown = history_service.get_markdown_report(
            str(row.analysis_history_id),
            owner_user_id=int(row.owner_user_id),
        )
        if markdown is None:
            raise ReportPublicShareError("not_found", "报告内容不可用")

        return {
            "share_token": row.share_token,
            "share_path": self.build_share_path(row.share_token),
            "report": report.model_dump(by_alias=True),
            "markdown": markdown,
        }

    @staticmethod
    def _serialize_share(row) -> Dict[str, Any]:
        return {
            "history_id": int(row.analysis_history_id),
            "share_token": row.share_token,
            "share_path": ReportPublicShareService.build_share_path(row.share_token),
            "enabled": bool(row.enabled),
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
