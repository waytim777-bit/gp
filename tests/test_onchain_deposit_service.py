# -*- coding: utf-8 -*-
"""Tests for on-chain contract deposit receipt verification."""

from __future__ import annotations

import unittest

from src.services.onchain_deposit_service import (
    DEPOSIT_TOPIC,
    TRANSFER_TOPIC,
    DepositVerificationError,
    OnchainDepositService,
)


WALLET = "0x1111111111111111111111111111111111111111"
TOKEN = "0x2222222222222222222222222222222222222222"
CONTRACT = "0x3333333333333333333333333333333333333333"
AMOUNT = 12345


def address_topic(address: str) -> str:
    return "0x" + address[2:].lower().rjust(64, "0")


def uint_data(value: int) -> str:
    return "0x" + hex(value)[2:].rjust(64, "0")


def receipt(*logs: dict[str, object], status: str = "0x1") -> dict[str, object]:
    return {"status": status, "logs": list(logs)}


def deposit_log(user: str = WALLET, amount: int = AMOUNT) -> dict[str, object]:
    return {
        "address": CONTRACT,
        "topics": [DEPOSIT_TOPIC, address_topic(user)],
        "data": uint_data(amount),
    }


def transfer_log(to: str = CONTRACT, amount: int = AMOUNT) -> dict[str, object]:
    return {
        "address": TOKEN,
        "topics": [TRANSFER_TOPIC, address_topic(WALLET), address_topic(to)],
        "data": uint_data(amount),
    }


class OnchainDepositServiceReceiptTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.service = OnchainDepositService.__new__(OnchainDepositService)

    def extract(self, tx_receipt: dict[str, object]) -> int:
        return self.service._extract_contract_deposit_amount(
            receipt=tx_receipt,
            token_address=TOKEN,
            wallet_address=WALLET,
            contract_address=CONTRACT,
        )

    def test_extracts_matching_deposit_and_transfer_amount(self) -> None:
        amount = self.extract(receipt(deposit_log(), transfer_log()))

        self.assertEqual(amount, AMOUNT)

    def test_rejects_missing_deposit_event(self) -> None:
        with self.assertRaisesRegex(DepositVerificationError, "deposit event"):
            self.extract(receipt(transfer_log()))

    def test_rejects_wrong_deposit_user(self) -> None:
        wrong_user = "0x4444444444444444444444444444444444444444"

        with self.assertRaisesRegex(DepositVerificationError, "deposit event"):
            self.extract(receipt(deposit_log(user=wrong_user), transfer_log()))

    def test_rejects_amount_mismatch(self) -> None:
        with self.assertRaisesRegex(DepositVerificationError, "does not match"):
            self.extract(receipt(deposit_log(amount=AMOUNT), transfer_log(amount=AMOUNT - 1)))

    def test_rejects_failed_receipt(self) -> None:
        with self.assertRaisesRegex(DepositVerificationError, "failed"):
            self.extract(receipt(deposit_log(), transfer_log(), status="0x0"))


class OnchainDepositServiceConfigTestCase(unittest.TestCase):
    def test_public_config_exposes_contract_address(self) -> None:
        service = OnchainDepositService.__new__(OnchainDepositService)
        settings = {
            "DEPOSIT_TOKEN_ADDRESS": TOKEN,
            "DEPOSIT_CONTRACT_ADDRESS": CONTRACT,
        }
        service._get_setting = lambda key: settings.get(key, "")  # type: ignore[method-assign]

        config = service.get_public_config()

        self.assertEqual(config["token_address"], TOKEN)
        self.assertEqual(config["contract_address"], CONTRACT)
        self.assertEqual(config["receiver_address"], CONTRACT)


if __name__ == "__main__":
    unittest.main()
