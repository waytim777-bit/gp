# -*- coding: utf-8 -*-
"""Tests for prediction report sharing and purchase marketplace."""

import os
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path
from unittest.mock import patch

from src.auth import register_user
from src.config import Config
from src.core.prediction_cycle import PredictionCycle
from src.services.credit_service import CreditService, InsufficientCreditsError
from src.services.prediction_report_market_service import (
    PredictionReportMarketError,
    PredictionReportMarketService,
)
from src.storage import AnalysisHistory, DatabaseManager, NewsIntel


class PredictionReportMarketTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temp_dir.name)
        self._original_database_path = os.environ.get("DATABASE_PATH")
        self._original_database_url = os.environ.get("DATABASE_URL")
        self._original_purchase = os.environ.get("PREDICTION_REPORT_PURCHASE_CREDITS")
        self._original_seller = os.environ.get("PREDICTION_REPORT_SELLER_CREDITS")
        os.environ["DATABASE_PATH"] = str(self.data_dir / "test.db")
        os.environ.pop("DATABASE_URL", None)
        os.environ["PREDICTION_REPORT_PURCHASE_CREDITS"] = "100"
        os.environ["PREDICTION_REPORT_SELLER_CREDITS"] = "90"
        Config.reset_instance()
        DatabaseManager.reset_instance()
        CreditService._instance = None
        PredictionReportMarketService._instance = None

        db = DatabaseManager.get_instance()
        self.seller_id = int(db.ensure_default_admin_user())
        CreditService.get_instance().add_credits(self.seller_id, 10, reason="test")

        buyer, err = register_user("buyer_user", "password123")
        self.assertIsNone(err)
        assert buyer is not None
        self.buyer_id = int(buyer["id"])
        CreditService.get_instance().add_credits(self.buyer_id, 200, reason="test")

        self.cycle = PredictionCycle(
            market="cn",
            cycle_anchor_date=date(2026, 6, 17),
            prediction_target_date=date(2026, 6, 20),
            data_as_of_date=date(2026, 6, 17),
            anchor_cutoff_at=datetime(2026, 6, 17, 18, 0),
            cycle_ends_at=datetime(2026, 6, 20, 18, 0),
        )

        shared = db.create_shared_analysis_run(
            code="600519",
            analysis_date=self.cycle.cycle_anchor_date,
            market="cn",
            report_type="simple",
            analysis_history_id=None,
            query_id="share-query",
            prediction_target_date=self.cycle.prediction_target_date,
            last_analyzed_at=datetime(2026, 6, 17, 19, 0),
            news_fingerprint='["https://news.example/a"]',
        )
        self.shared_run_id = int(shared.id)

        with db.session_scope() as session:
            history = AnalysisHistory(
                query_id="share-query",
                owner_user_id=self.seller_id,
                code="600519",
                name="贵州茅台",
                report_type="simple",
                sentiment_score=72,
                operation_advice="持有",
                trend_prediction="上行",
                analysis_summary="seller summary",
                raw_result='{"current_price": 100}',
                news_content="https://news.example/a",
                created_at=datetime.now(),
                shared_run_id=self.shared_run_id,
            )
            session.add(history)
            session.flush()
            self.history_id = int(history.id)

        db.update_shared_analysis_run(
            self.shared_run_id,
            analysis_history_id=self.history_id,
        )
        self.service = PredictionReportMarketService.get_instance()

    def tearDown(self) -> None:
        PredictionReportMarketService._instance = None
        CreditService._instance = None
        Config.reset_instance()
        DatabaseManager.reset_instance()
        if self._original_database_path is None:
            os.environ.pop("DATABASE_PATH", None)
        else:
            os.environ["DATABASE_PATH"] = self._original_database_path
        if self._original_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = self._original_database_url
        if self._original_purchase is None:
            os.environ.pop("PREDICTION_REPORT_PURCHASE_CREDITS", None)
        else:
            os.environ["PREDICTION_REPORT_PURCHASE_CREDITS"] = self._original_purchase
        if self._original_seller is None:
            os.environ.pop("PREDICTION_REPORT_SELLER_CREDITS", None)
        else:
            os.environ["PREDICTION_REPORT_SELLER_CREDITS"] = self._original_seller
        self.temp_dir.cleanup()

    @patch("src.services.prediction_report_market_service.resolve_prediction_cycle")
    def test_share_and_list_current_cycle(self, mock_resolve) -> None:
        mock_resolve.return_value = self.cycle

        listing = self.service.share_report(
            owner_user_id=self.seller_id,
            history_id=self.history_id,
        )
        self.assertEqual(listing["code"], "600519")
        self.assertEqual(listing["purchase_credits"], 100)
        self.assertTrue(listing["is_mine"])

        payload = self.service.list_reports(viewer_user_id=self.buyer_id)
        self.assertEqual(payload["total"], 1)
        self.assertEqual(payload["items"][0]["id"], listing["id"])
        self.assertFalse(payload["items"][0]["purchased"])

    @patch("src.services.prediction_report_market_service.resolve_prediction_cycle")
    def test_purchase_transfers_credits_and_clones_report(self, mock_resolve) -> None:
        mock_resolve.return_value = self.cycle

        listing = self.service.share_report(
            owner_user_id=self.seller_id,
            history_id=self.history_id,
        )
        db = DatabaseManager.get_instance()
        # Seed canonical news rows under seller's query_id so buyer can see them after purchase.
        with db.session_scope() as session:
            session.add(
                NewsIntel(
                    owner_user_id=self.seller_id,
                    query_id="share-query",
                    code="600519",
                    name="贵州茅台",
                    dimension="latest_news",
                    query="q",
                    provider="test",
                    title="test news",
                    snippet="snippet",
                    url="https://news.example/item",
                    source="example",
                    fetched_at=datetime.now(),
                    query_source="test",
                )
            )

        buyer_before = CreditService.get_instance().get_balance(self.buyer_id)
        seller_before = CreditService.get_instance().get_balance(self.seller_id)

        result = self.service.purchase_report(
            buyer_user_id=self.buyer_id,
            listing_id=int(listing["id"]),
        )
        self.assertFalse(result["already_purchased"])
        self.assertEqual(result["credits_paid"], 100)
        self.assertIsNotNone(result["buyer_history_id"])

        buyer_after = CreditService.get_instance().get_balance(self.buyer_id)
        seller_after = CreditService.get_instance().get_balance(self.seller_id)
        self.assertEqual(buyer_before - buyer_after, 100)
        self.assertEqual(seller_after - seller_before, 90)

        detail = self.service.get_listing(
            listing_id=int(listing["id"]),
            viewer_user_id=self.buyer_id,
        )
        self.assertTrue(detail["purchased"])
        self.assertTrue(detail["can_view_full"])
        self.assertEqual(detail["preview"]["analysis_summary"], "seller summary")
        # News intel should be cloned to buyer scope (resolved by record_id -> query_id).
        from src.services.history_service import HistoryService
        items = HistoryService(db).get_news_intel_by_record_id(
            int(result["buyer_history_id"]),
            limit=20,
            owner_user_id=self.buyer_id,
        )
        self.assertTrue(items)

    @patch("src.services.prediction_report_market_service.resolve_prediction_cycle")
    def test_purchase_rejects_insufficient_credits(self, mock_resolve) -> None:
        mock_resolve.return_value = self.cycle
        listing = self.service.share_report(
            owner_user_id=self.seller_id,
            history_id=self.history_id,
        )

        poor_user, err = register_user("poor_user", "password123")
        self.assertIsNone(err)
        assert poor_user is not None
        poor_id = int(poor_user["id"])

        with self.assertRaises(InsufficientCreditsError):
            self.service.purchase_report(
                buyer_user_id=poor_id,
                listing_id=int(listing["id"]),
            )

    @patch("src.services.prediction_report_market_service.resolve_prediction_cycle")
    def test_share_rejects_without_canonical_run(self, mock_resolve) -> None:
        mock_resolve.return_value = self.cycle

        db = DatabaseManager.get_instance()
        with db.session_scope() as session:
            orphan_history = AnalysisHistory(
                query_id="orphan-query",
                owner_user_id=self.seller_id,
                code="000001",
                name="平安银行",
                report_type="simple",
                sentiment_score=50,
                operation_advice="观望",
                trend_prediction="震荡",
                analysis_summary="orphan summary",
                raw_result='{"current_price": 10}',
                news_content="https://news.example/orphan",
                created_at=datetime.now(),
            )
            session.add(orphan_history)
            session.flush()
            orphan_history_id = int(orphan_history.id)

        with self.assertRaises(PredictionReportMarketError) as ctx:
            self.service.share_report(
                owner_user_id=self.seller_id,
                history_id=orphan_history_id,
            )
        self.assertEqual(ctx.exception.code, "not_shareable")


if __name__ == "__main__":
    unittest.main()
