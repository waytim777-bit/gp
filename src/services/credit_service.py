# -*- coding: utf-8 -*-
"""
Credit management service for centralized pre-paid token system.

Handles:
- Balance queries and atomic deductions (per LLM token consumed)
- Manual credit top-up (to be replaced by on-chain deposit later)
"""

from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timedelta
from typing import Dict, Optional

from sqlalchemy import select

from src.storage import (
    DatabaseManager,
    CreditTransaction,
    CreditDeduction,
    UserCreditBalance,
)

logger = logging.getLogger(__name__)


class InsufficientCreditsError(Exception):
    def __init__(self, required: int, balance: int):
        self.required = required
        self.balance = balance
        super().__init__(f"Insufficient credits: need {required}, have {balance}")


class DailyClaimAlreadyClaimedError(Exception):
    """用户今日已领取积分"""

    def __init__(self, user_id: int):
        self.user_id = user_id
        super().__init__(f"用户 {user_id} 今日已领取积分")


class CreditService:
    _instance: Optional[CreditService] = None
    _lock = threading.Lock()

    def __init__(self):
        pass

    @classmethod
    def get_instance(cls) -> CreditService:
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    # ------------------------------------------------------------------
    # Config helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_positive_int_env(name: str, default: int) -> int:
        raw = os.getenv(name)
        if raw is None or not raw.strip():
            return default
        try:
            value = int(raw)
        except ValueError:
            logger.warning("Invalid %s=%r, falling back to %d", name, raw, default)
            return default
        if value <= 0:
            logger.warning("Invalid %s=%r, falling back to %d", name, raw, default)
            return default
        return value

    def _get_credits_per_dollar(self) -> int:
        return self._parse_positive_int_env("CREDITS_PER_DOLLAR", 100)

    def _get_credits_per_1k_tokens(self) -> int:
        return self._parse_positive_int_env("CREDITS_PER_1K_TOKENS", 10)

    def _get_daily_claim_amount(self) -> int:
        return self._parse_positive_int_env("DAILY_CLAIM_AMOUNT", 1000)

    # ------------------------------------------------------------------
    # Balance
    # ------------------------------------------------------------------

    def get_balance(self, user_id: int) -> int:
        db = DatabaseManager.get_instance()
        with db.get_session() as session:
            row = session.execute(
                select(UserCreditBalance).where(
                    UserCreditBalance.user_id == user_id
                )
            ).scalar_one_or_none()
            return row.balance if row else 0

    def check_balance(self, user_id: int) -> bool:
        return self.get_balance(user_id) > 0

    # ------------------------------------------------------------------
    # Top-up (manual, centralized — will be replaced by on-chain later)
    # ------------------------------------------------------------------

    def add_credits(
        self,
        user_id: int,
        credit_amount: int,
        operator_user_id: Optional[int] = None,
        reason: Optional[str] = None,
    ) -> CreditTransaction:
        """Add credits to a user account. Returns the transaction record."""
        if credit_amount <= 0:
            raise ValueError("Credit amount must be positive")
        db = DatabaseManager.get_instance()
        tx = db.add_credit_transaction(
            user_id=user_id,
            credit_amount=credit_amount,
            operator_user_id=operator_user_id,
            reason=reason,
        )
        logger.info(
            "Credits added: user=%d amount=%d operator=%s reason=%s",
            user_id, credit_amount, operator_user_id, reason,
        )
        return tx

    def claim_daily_credits(self, user_id: int) -> int:
        """每日领取积分。返回新余额，今日已领取则抛出 DailyClaimAlreadyClaimedError。"""
        amount = self._get_daily_claim_amount()
        now = datetime.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + timedelta(days=1)

        db = DatabaseManager.get_instance()
        with db.get_session() as session:
            existing = session.execute(
                select(CreditTransaction).where(
                    CreditTransaction.user_id == user_id,
                    CreditTransaction.reason == "daily_claim",
                    CreditTransaction.created_at >= today_start,
                    CreditTransaction.created_at < today_end,
                )
            ).scalar_one_or_none()

        if existing is not None:
            raise DailyClaimAlreadyClaimedError(user_id)

        self.add_credits(
            user_id=user_id,
            credit_amount=amount,
            operator_user_id=user_id,
            reason="daily_claim",
        )
        return self.get_balance(user_id)

    # ------------------------------------------------------------------
    # Deduction
    # ------------------------------------------------------------------

    def deduct_tokens(
        self,
        user_id: int,
        total_tokens: int,
        call_type: str,
        model: str,
        llm_usage_id: Optional[int] = None,
    ) -> int:
        """
        Deduct credits based on actual token consumption.

        Returns credits_spent, or 0 if rate is not positive.
        """
        rate = self._get_credits_per_1k_tokens()
        if rate <= 0:
            return 0

        credits_spent = max(1, total_tokens * rate // 1000)

        db = DatabaseManager.get_instance()
        with db.session_scope() as session:
            balance_row = session.execute(
                select(UserCreditBalance).where(
                    UserCreditBalance.user_id == user_id
                ).with_for_update()
            ).scalar_one_or_none()

            if balance_row is None:
                logger.warning(
                    "Credit deduction skipped: user=%d has no balance record, "
                    "tokens=%d would_spend=%d",
                    user_id, total_tokens, credits_spent,
                )
                return 0

            if balance_row.balance <= 0:
                logger.warning(
                    "Credit deduction skipped: user=%d balance=%d already "
                    "exhausted, tokens=%d would_spend=%d",
                    user_id, balance_row.balance, total_tokens, credits_spent,
                )
                return 0

            actual_spent = min(credits_spent, balance_row.balance)
            if actual_spent < credits_spent:
                logger.warning(
                    "Credit deduction partial: user=%d balance=%d insufficient "
                    "for tokens=%d, need=%d actual=%d",
                    user_id, balance_row.balance, total_tokens,
                    credits_spent, actual_spent,
                )

            balance_row.balance -= actual_spent
            balance_row.version += 1
            balance_after = balance_row.balance

            deduction = CreditDeduction(
                user_id=user_id,
                llm_usage_id=llm_usage_id,
                call_type=call_type,
                model=model,
                total_tokens=total_tokens,
                credits_spent=actual_spent,
                balance_after=balance_after,
            )
            session.add(deduction)

            credits_spent = actual_spent

        logger.debug(
            "Credit deduction: user=%d tokens=%d spent=%d balance=%d",
            user_id, total_tokens, credits_spent, balance_after,
        )
        return credits_spent

    def deduct_subscription_push(
        self,
        user_id: int,
        credits: int,
        *,
        subscription_id: Optional[int] = None,
        code: Optional[str] = None,
    ) -> int:
        """Deduct fixed credits after a successful subscription push."""
        amount = int(credits)
        if amount <= 0:
            return 0

        db = DatabaseManager.get_instance()
        with db.session_scope() as session:
            balance_row = session.execute(
                select(UserCreditBalance).where(
                    UserCreditBalance.user_id == user_id
                ).with_for_update()
            ).scalar_one_or_none()

            if balance_row is None or balance_row.balance < amount:
                return 0

            balance_row.balance -= amount
            balance_row.version += 1
            balance_after = balance_row.balance

            reason_bits = ["subscription_push"]
            if subscription_id is not None:
                reason_bits.append(f"sub={subscription_id}")
            if code:
                reason_bits.append(code)

            session.add(
                CreditDeduction(
                    user_id=user_id,
                    call_type="subscription_push",
                    model="subscription",
                    total_tokens=0,
                    credits_spent=amount,
                    balance_after=balance_after,
                )
            )

        logger.info(
            "Subscription credit deduction: user=%d sub=%s code=%s spent=%d balance=%d",
            user_id,
            subscription_id,
            code,
            amount,
            balance_after,
        )
        return amount

    def deduct_analysis_probe(
        self,
        user_id: int,
        *,
        code: Optional[str] = None,
        shared_run_id: Optional[int] = None,
    ) -> int:
        """Deduct fixed credits for a successful intel probe with no new news."""
        amount = self._parse_positive_int_env("CREDITS_ANALYSIS_PROBE", 2)
        if amount <= 0:
            return 0

        db = DatabaseManager.get_instance()
        with db.session_scope() as session:
            balance_row = session.execute(
                select(UserCreditBalance).where(
                    UserCreditBalance.user_id == user_id
                ).with_for_update()
            ).scalar_one_or_none()

            if balance_row is None or balance_row.balance < amount:
                return 0

            balance_row.balance -= amount
            balance_row.version += 1
            balance_after = balance_row.balance

            session.add(
                CreditDeduction(
                    user_id=user_id,
                    call_type="analysis_probe",
                    model="searxng",
                    total_tokens=0,
                    credits_spent=amount,
                    balance_after=balance_after,
                )
            )

        logger.info(
            "Analysis probe credit deduction: user=%d code=%s run=%s spent=%d balance=%d",
            user_id,
            code,
            shared_run_id,
            amount,
            balance_after,
        )
        return amount

    def purchase_prediction_report(
        self,
        *,
        buyer_user_id: int,
        seller_user_id: int,
        purchase_credits: int,
        seller_credits: int,
        listing_id: int,
        code: Optional[str] = None,
    ) -> Dict[str, int]:
        """Transfer credits for a prediction report marketplace purchase."""
        paid = int(purchase_credits)
        reward = int(seller_credits)
        if paid <= 0:
            raise ValueError("purchase_credits must be positive")
        if reward < 0 or reward > paid:
            raise ValueError("invalid seller reward")

        db = DatabaseManager.get_instance()
        with db.session_scope() as session:
            buyer_row = session.execute(
                select(UserCreditBalance).where(
                    UserCreditBalance.user_id == int(buyer_user_id)
                ).with_for_update()
            ).scalar_one_or_none()
            if buyer_row is None or int(buyer_row.balance) < paid:
                balance = int(buyer_row.balance) if buyer_row is not None else 0
                raise InsufficientCreditsError(paid, balance)

            seller_row = session.execute(
                select(UserCreditBalance).where(
                    UserCreditBalance.user_id == int(seller_user_id)
                ).with_for_update()
            ).scalar_one_or_none()

            buyer_row.balance -= paid
            buyer_row.version += 1
            buyer_after = int(buyer_row.balance)

            session.add(
                CreditDeduction(
                    user_id=int(buyer_user_id),
                    call_type="prediction_report_purchase",
                    model="marketplace",
                    total_tokens=0,
                    credits_spent=paid,
                    balance_after=buyer_after,
                )
            )

            if reward > 0:
                if seller_row is None:
                    seller_row = UserCreditBalance(
                        user_id=int(seller_user_id),
                        balance=reward,
                        lifetime_credits=reward,
                    )
                    session.add(seller_row)
                else:
                    seller_row.balance += reward
                    seller_row.lifetime_credits += reward
                    seller_row.version += 1

                session.add(
                    CreditTransaction(
                        user_id=int(seller_user_id),
                        credit_amount=reward,
                        operator_user_id=int(buyer_user_id),
                        reason=f"prediction_report_sale listing={listing_id} code={code or ''}".strip(),
                    )
                )

        logger.info(
            "Prediction report purchase: listing=%s buyer=%s seller=%s paid=%d reward=%d",
            listing_id,
            buyer_user_id,
            seller_user_id,
            paid,
            reward,
        )
        return {"credits_paid": paid, "seller_credits": reward, "buyer_balance": buyer_after}
