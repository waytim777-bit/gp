# -*- coding: utf-8 -*-
"""Payment and credit endpoints."""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from api.deps import get_current_user
from src.services.credit_service import CreditService, DailyClaimAlreadyClaimedError
from src.services.onchain_deposit_service import (
    DepositConfigError,
    DepositVerificationError,
    OnchainDepositService,
)
from src.storage import DatabaseManager, CreditTransaction, CreditDeduction, UserCreditBalance
from src.user_context import CurrentUser
from sqlalchemy import func, literal, select, union_all

router = APIRouter()


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------

class BalanceResponse(BaseModel):
    balance: int
    lifetime_credits: int = 0
    claimed_today: bool = False


class RateResponse(BaseModel):
    credits_per_dollar: int
    credits_per_1k_tokens: int


class DepositConfigResponse(BaseModel):
    chain_id: int
    receiver_address: str
    token_address: str


class DepositRequest(BaseModel):
    tx_hash: str = Field(..., min_length=66, max_length=66, description="On-chain transaction hash")
    wallet_address: str = Field(..., min_length=42, max_length=42, description="Connected wallet address")


class DepositResponse(BaseModel):
    success: bool
    deposit_id: int
    transaction_id: int | None = None
    credit_amount: int
    balance: int
    status: str


class DepositHistoryItem(BaseModel):
    id: int
    credit_amount: int
    operator_user_id: int | None = None
    reason: str | None = None
    created_at: str


class DeductionHistoryItem(BaseModel):
    id: int
    call_type: str
    model: str
    total_tokens: int
    credits_spent: int
    balance_after: int
    created_at: str


class PaymentHistoryItem(BaseModel):
    id: int
    kind: str
    detail: str
    transaction_type: str
    credit_amount: int
    created_at: str
    operator_user_id: int | None = None
    reason: str | None = None
    call_type: str | None = None
    model: str | None = None
    total_tokens: int | None = None
    credits_spent: int | None = None
    balance_after: int | None = None


class HistoryResponse(BaseModel):
    deposits: list[DepositHistoryItem]
    deductions: list[DeductionHistoryItem]
    items: list[PaymentHistoryItem] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 20
    total_pages: int = 0


class ClaimResponse(BaseModel):
    balance: int
    claimed: bool = True


# ------------------------------------------------------------------
# Dependencies
# ------------------------------------------------------------------

def get_credit_service() -> CreditService:
    return CreditService.get_instance()


def get_db_manager() -> DatabaseManager:
    return DatabaseManager.get_instance()


def get_onchain_deposit_service() -> OnchainDepositService:
    return OnchainDepositService()


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------

@router.get("/balance", response_model=BalanceResponse)
def get_balance(
    current_user: CurrentUser = Depends(get_current_user),
    credit_service: CreditService = Depends(get_credit_service),
    db_manager: DatabaseManager = Depends(get_db_manager),
):
    """获取当前用户积分余额。"""
    balance = credit_service.get_balance(current_user.id)
    lifetime = 0
    claimed_today = False
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    with db_manager.get_session() as session:
        bal = session.execute(
            select(UserCreditBalance).where(
                UserCreditBalance.user_id == current_user.id
            )
        ).scalar_one_or_none()
        if bal is not None:
            lifetime = bal.lifetime_credits
        claimed_today = session.execute(
            select(CreditTransaction).where(
                CreditTransaction.user_id == current_user.id,
                CreditTransaction.reason == "daily_claim",
                CreditTransaction.created_at >= today_start,
                CreditTransaction.created_at < today_end,
            )
        ).scalar_one_or_none() is not None
    return BalanceResponse(
        balance=balance,
        lifetime_credits=lifetime,
        claimed_today=claimed_today,
    )


@router.get("/rate", response_model=RateResponse)
def get_rate(
    credit_service: CreditService = Depends(get_credit_service),
):
    """Return current credit pricing."""
    return RateResponse(
        credits_per_dollar=credit_service._get_credits_per_dollar(),
        credits_per_1k_tokens=credit_service._get_credits_per_1k_tokens(),
    )


@router.get("/deposit/config", response_model=DepositConfigResponse)
def get_deposit_config(
    deposit_service: OnchainDepositService = Depends(get_onchain_deposit_service),
):
    """Return public on-chain deposit config for the frontend transfer."""
    try:
        return deposit_service.get_public_config()
    except DepositConfigError as exc:
        raise HTTPException(
            status_code=503,
            detail={"error": "deposit_not_configured", "message": str(exc)},
        )


@router.post("/deposit", response_model=DepositResponse)
def deposit_credits(
    request: DepositRequest,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(get_current_user),
    deposit_service: OnchainDepositService = Depends(get_onchain_deposit_service),
):
    """Submit an ERC20 deposit transaction hash for verification and settlement."""
    try:
        result = deposit_service.submit_deposit(
            user_id=current_user.id,
            wallet_address=request.wallet_address,
            tx_hash=request.tx_hash,
        )
        if result["status"] == "pending":
            background_tasks.add_task(deposit_service.wait_for_deposit, request.tx_hash)
        return result
    except DepositConfigError as exc:
        raise HTTPException(
            status_code=503,
            detail={"error": "deposit_not_configured", "message": str(exc)},
        )
    except DepositVerificationError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_deposit", "message": str(exc)},
        )


@router.get("/history", response_model=HistoryResponse)
def get_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    db_manager: DatabaseManager = Depends(get_db_manager),
):
    """Return deposit and deduction history for the current user."""
    offset = (page - 1) * page_size

    with db_manager.get_session() as session:
        deposits_query = select(
            CreditTransaction.id.label("id"),
            literal("deposit").label("kind"),
            CreditTransaction.reason.label("detail"),
            literal("充值").label("transaction_type"),
            CreditTransaction.credit_amount.label("credit_amount"),
            CreditTransaction.created_at.label("created_at"),
            CreditTransaction.operator_user_id.label("operator_user_id"),
            CreditTransaction.reason.label("reason"),
            literal(None).label("call_type"),
            literal(None).label("model"),
            literal(None).label("total_tokens"),
            literal(None).label("credits_spent"),
            literal(None).label("balance_after"),
        ).where(CreditTransaction.user_id == current_user.id)

        deductions_query = select(
            CreditDeduction.id.label("id"),
            literal("deduction").label("kind"),
            CreditDeduction.call_type.label("detail"),
            literal("消费").label("transaction_type"),
            (-CreditDeduction.credits_spent).label("credit_amount"),
            CreditDeduction.created_at.label("created_at"),
            literal(None).label("operator_user_id"),
            literal(None).label("reason"),
            CreditDeduction.call_type.label("call_type"),
            CreditDeduction.model.label("model"),
            CreditDeduction.total_tokens.label("total_tokens"),
            CreditDeduction.credits_spent.label("credits_spent"),
            CreditDeduction.balance_after.label("balance_after"),
        ).where(CreditDeduction.user_id == current_user.id)

        history_rows = union_all(deposits_query, deductions_query).subquery()
        total = int(session.execute(select(func.count()).select_from(history_rows)).scalar_one() or 0)
        rows = session.execute(
            select(history_rows)
            .order_by(history_rows.c.created_at.desc(), history_rows.c.id.desc())
            .offset(offset)
            .limit(page_size)
        ).mappings().all()

        legacy_deposits = session.execute(
            select(CreditTransaction)
            .where(CreditTransaction.user_id == current_user.id)
            .order_by(CreditTransaction.created_at.desc())
            .limit(50)
        ).scalars().all()

        legacy_deductions = session.execute(
            select(CreditDeduction)
            .where(CreditDeduction.user_id == current_user.id)
            .order_by(CreditDeduction.created_at.desc())
            .limit(50)
        ).scalars().all()

    items = [
        PaymentHistoryItem(
            id=int(row["id"]),
            kind=str(row["kind"]),
            detail=str(row["detail"] or ("积分充值" if row["kind"] == "deposit" else "")),
            transaction_type=str(row["transaction_type"]),
            credit_amount=int(row["credit_amount"] or 0),
            created_at=row["created_at"].isoformat() if row["created_at"] else "",
            operator_user_id=row["operator_user_id"],
            reason=row["reason"],
            call_type=row["call_type"],
            model=row["model"],
            total_tokens=row["total_tokens"],
            credits_spent=row["credits_spent"],
            balance_after=row["balance_after"],
        )
        for row in rows
    ]

    return HistoryResponse(
        deposits=[
            DepositHistoryItem(
                id=d.id,
                credit_amount=d.credit_amount,
                operator_user_id=d.operator_user_id,
                reason=d.reason,
                created_at=d.created_at.isoformat() if d.created_at else "",
            )
            for d in legacy_deposits
        ],
        deductions=[
            DeductionHistoryItem(
                id=d.id,
                call_type=d.call_type,
                model=d.model,
                total_tokens=d.total_tokens,
                credits_spent=d.credits_spent,
                balance_after=d.balance_after,
                created_at=d.created_at.isoformat() if d.created_at else "",
            )
            for d in legacy_deductions
        ],
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size if total > 0 else 0,
    )


@router.post("/claim", response_model=ClaimResponse)
def claim_daily_credits(
    current_user: CurrentUser = Depends(get_current_user),
    credit_service: CreditService = Depends(get_credit_service),
):
    """每日领取积分。今日已领取则返回 409。"""
    try:
        balance = credit_service.claim_daily_credits(current_user.id)
        return ClaimResponse(balance=balance, claimed=True)
    except DailyClaimAlreadyClaimedError:
        raise HTTPException(
            status_code=409,
            detail={"error": "already_claimed", "message": "今日已领取"},
        )
