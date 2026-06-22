# -*- coding: utf-8 -*-
"""Admin operations for stock autocomplete index maintenance."""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import sys
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from src.data.stock_index_loader import (
    _STOCK_INDEX_FILENAME,
    clear_stock_index_cache_for_admin,
    get_stock_index_candidate_paths,
)

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DATA_DIR = _REPO_ROOT / "data"
_WEB_DIR = _REPO_ROOT / "apps" / "dsa-web"
_INDEX_PUBLIC = _WEB_DIR / "public" / _STOCK_INDEX_FILENAME
_INDEX_STATIC = _REPO_ROOT / "static" / _STOCK_INDEX_FILENAME
_FETCH_SCRIPT = _REPO_ROOT / "scripts" / "fetch_tushare_stock_list.py"
_GENERATE_SCRIPT = _REPO_ROOT / "scripts" / "generate_index_from_csv.py"


class StockIndexAdminBusyError(RuntimeError):
    """Raised when another stock-index maintenance task is running."""


class StockIndexAdminService:
    _instance: Optional["StockIndexAdminService"] = None
    _instance_lock = threading.Lock()
    _task_lock = threading.Lock()

    @classmethod
    def get_instance(cls) -> "StockIndexAdminService":
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def get_status(self, lookup: Optional[str] = None) -> Dict[str, Any]:
        index_path = self._resolve_index_path()
        index_stats = self._read_index_stats(index_path)
        csv_files = {
            "aShare": self._file_info(_DATA_DIR / "stock_list_a.csv"),
            "hk": self._file_info(_DATA_DIR / "stock_list_hk.csv"),
            "us": self._file_info(_DATA_DIR / "stock_list_us.csv"),
        }
        payload: Dict[str, Any] = {
            "indexPublic": self._file_info(_INDEX_PUBLIC),
            "indexStatic": self._file_info(_INDEX_STATIC),
            "activeIndexPath": str(index_path) if index_path else None,
            "indexStats": index_stats,
            "csvFiles": csv_files,
            "tushareTokenConfigured": bool(
                (__import__("os").getenv("TUSHARE_TOKEN") or "").strip()
            ),
        }
        if lookup:
            payload["lookupResults"] = self._lookup_in_index(lookup, index_path)
        return payload

    def fetch_stock_lists(self) -> Dict[str, Any]:
        result = self._run_locked_task(
            "fetch_stock_lists",
            lambda: self._run_script(_FETCH_SCRIPT, timeout=900),
        )
        return {
            **result,
            "status": self.get_status(),
        }

    def generate_index(self, *, test_mode: bool = False, source: str = "tushare") -> Dict[str, Any]:
        args = ["--source", source]
        if test_mode:
            args.append("--test")
        result = self._run_locked_task(
            "generate_index_test" if test_mode else "generate_index",
            lambda: self._run_script(_GENERATE_SCRIPT, *args, timeout=600),
        )
        publish_result: Optional[Dict[str, Any]] = None
        if result["success"] and not test_mode:
            publish_result = self.publish_index()
        return {
            **result,
            "publish": publish_result,
            "status": self.get_status(),
        }

    def publish_index(self) -> Dict[str, Any]:
        source = self._resolve_generated_index_source()
        if source is None:
            raise FileNotFoundError("未找到可发布的 stocks.index.json，请先生成索引")

        _INDEX_STATIC.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, _INDEX_STATIC)
        clear_stock_index_cache_for_admin()
        logger.info("Published stock index: %s -> %s", source, _INDEX_STATIC)
        return {
            "sourcePath": str(source),
            "targetPath": str(_INDEX_STATIC),
            "sizeKb": round(_INDEX_STATIC.stat().st_size / 1024, 2),
        }

    def build_web_frontend(self) -> Dict[str, Any]:
        npm = shutil.which("npm")
        if not npm:
            raise RuntimeError("未找到 npm，请先安装 Node.js")

        def _build() -> Dict[str, Any]:
            completed = subprocess.run(
                [npm, "run", "build"],
                cwd=_WEB_DIR,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=900,
                check=False,
                env=self._child_process_env(),
            )
            success = completed.returncode == 0
            if success:
                clear_stock_index_cache_for_admin()
            return {
                "success": success,
                "exitCode": completed.returncode,
                "stdout": self._tail_output(completed.stdout),
                "stderr": self._tail_output(completed.stderr),
            }

        result = self._run_locked_task("build_web_frontend", _build())
        return {
            **result,
            "status": self.get_status(),
        }

    def _run_locked_task(self, task_name: str, runner) -> Dict[str, Any]:
        if not self._task_lock.acquire(blocking=False):
            raise StockIndexAdminBusyError("已有股票索引维护任务正在执行，请稍后再试")
        try:
            logger.info("Stock index admin task started: %s", task_name)
            payload = runner()
            payload["task"] = task_name
            return payload
        finally:
            self._task_lock.release()

    @staticmethod
    def _child_process_env() -> Dict[str, str]:
        env = os.environ.copy()
        # Windows 默认 GBK 会导致脚本 print("✓ ...") 等 Unicode 输出失败
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"
        return env

    def _run_script(self, script_path: Path, *args: str, timeout: int) -> Dict[str, Any]:
        if not script_path.is_file():
            raise FileNotFoundError(f"脚本不存在: {script_path}")

        completed = subprocess.run(
            [sys.executable, str(script_path), *args],
            cwd=_REPO_ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=False,
            env=self._child_process_env(),
        )
        success = completed.returncode == 0
        if not success:
            logger.warning(
                "Stock index script failed (%s): exit=%s",
                script_path.name,
                completed.returncode,
            )
        return {
            "success": success,
            "exitCode": completed.returncode,
            "stdout": self._tail_output(completed.stdout),
            "stderr": self._tail_output(completed.stderr),
        }

    @staticmethod
    def _tail_output(text: str, max_lines: int = 120) -> str:
        lines = (text or "").splitlines()
        if len(lines) <= max_lines:
            return "\n".join(lines)
        omitted = len(lines) - max_lines
        return "\n".join([f"... ({omitted} lines omitted) ...", *lines[-max_lines:]])

    @staticmethod
    def _file_info(path: Path) -> Dict[str, Any]:
        if not path.is_file():
            return {"exists": False, "path": str(path)}
        stat = path.stat()
        return {
            "exists": True,
            "path": str(path),
            "sizeKb": round(stat.st_size / 1024, 2),
            "modifiedAt": datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
        }

    def _resolve_index_path(self) -> Optional[Path]:
        for candidate in get_stock_index_candidate_paths():
            if candidate.is_file():
                return candidate
        if _INDEX_STATIC.is_file():
            return _INDEX_STATIC
        return None

    def _resolve_generated_index_source(self) -> Optional[Path]:
        if _INDEX_PUBLIC.is_file():
            return _INDEX_PUBLIC
        if _INDEX_STATIC.is_file():
            return _INDEX_STATIC
        return None

    def _read_index_stats(self, index_path: Optional[Path]) -> Dict[str, Any]:
        if index_path is None or not index_path.is_file():
            return {"exists": False, "total": 0, "markets": {}}

        with index_path.open("r", encoding="utf-8") as handle:
            rows = json.load(handle)
        if not isinstance(rows, list):
            return {"exists": True, "total": 0, "markets": {}, "invalid": True}

        markets: Dict[str, int] = {}
        for row in rows:
            if not isinstance(row, list) or len(row) < 7:
                continue
            market = str(row[6])
            markets[market] = markets.get(market, 0) + 1
        return {
            "exists": True,
            "total": len(rows),
            "markets": markets,
        }

    def _lookup_in_index(self, query: str, index_path: Optional[Path]) -> List[Dict[str, str]]:
        needle = (query or "").strip().lower()
        if not needle or index_path is None or not index_path.is_file():
            return []

        with index_path.open("r", encoding="utf-8") as handle:
            rows = json.load(handle)
        if not isinstance(rows, list):
            return []

        matches: List[Dict[str, str]] = []
        for row in rows:
            if not isinstance(row, list) or len(row) < 3:
                continue
            canonical = str(row[0])
            display = str(row[1])
            name = str(row[2])
            haystack = f"{canonical} {display} {name}".lower()
            if needle in haystack:
                matches.append(
                    {
                        "canonicalCode": canonical,
                        "displayCode": display,
                        "nameZh": name,
                    }
                )
            if len(matches) >= 20:
                break
        return matches
