"""Checks do entitlement Free/Pro e do checkout mock (sem Firestore)."""
import asyncio
import unittest
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from models.user import SubscriptionTier, UserInDB
from services import checkout_service, entitlement_service
from services.entitlement_service import (
    FREE_ACTIVE_TRIP_LIMIT,
    PREMIUM_REQUIRED_CODE,
    is_premium_effective,
)


def _user(
    *,
    tier: SubscriptionTier = SubscriptionTier.FREE,
    premium_until: datetime | None = None,
) -> UserInDB:
    return UserInDB(
        uid="uid-a",
        email="a@example.com",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        tier=tier,
        premium_until=premium_until,
    )


class IsPremiumEffectiveTest(unittest.TestCase):
    def test_free_is_not_premium(self) -> None:
        self.assertFalse(is_premium_effective(_user()))

    def test_pro_without_until_is_lifetime(self) -> None:
        self.assertTrue(
            is_premium_effective(_user(tier=SubscriptionTier.PRO, premium_until=None))
        )

    def test_pro_future_until_is_premium(self) -> None:
        until = datetime.now(UTC) + timedelta(days=10)
        self.assertTrue(
            is_premium_effective(_user(tier=SubscriptionTier.PRO, premium_until=until))
        )

    def test_pro_expired_is_free(self) -> None:
        until = datetime.now(UTC) - timedelta(days=1)
        self.assertFalse(
            is_premium_effective(_user(tier=SubscriptionTier.PRO, premium_until=until))
        )


class AssertCanAddActiveTripTest(unittest.TestCase):
    def test_missing_user_404(self) -> None:
        with patch(
            "services.entitlement_service.user_repository.get_user",
            new=AsyncMock(return_value=None),
        ):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(entitlement_service.assert_can_add_active_trip("uid-a"))
        self.assertEqual(ctx.exception.status_code, 404)

    def test_free_at_limit_402(self) -> None:
        with (
            patch(
                "services.entitlement_service.user_repository.get_user",
                new=AsyncMock(return_value=_user()),
            ),
            patch(
                "services.entitlement_service.trips_repository.count_active",
                new=AsyncMock(return_value=FREE_ACTIVE_TRIP_LIMIT),
            ),
        ):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(entitlement_service.assert_can_add_active_trip("uid-a"))
        self.assertEqual(ctx.exception.status_code, 402)
        detail = ctx.exception.detail
        self.assertIsInstance(detail, dict)
        self.assertEqual(detail["code"], PREMIUM_REQUIRED_CODE)
        self.assertEqual(detail["reason"], "active_trip_limit")
        self.assertEqual(detail["limit"], FREE_ACTIVE_TRIP_LIMIT)
        self.assertEqual(detail["current"], FREE_ACTIVE_TRIP_LIMIT)

    def test_pro_skips_count(self) -> None:
        count = AsyncMock()
        with (
            patch(
                "services.entitlement_service.user_repository.get_user",
                new=AsyncMock(
                    return_value=_user(tier=SubscriptionTier.PRO, premium_until=None)
                ),
            ),
            patch(
                "services.entitlement_service.trips_repository.count_active",
                new=count,
            ),
        ):
            asyncio.run(entitlement_service.assert_can_add_active_trip("uid-a"))
        count.assert_not_called()

    def test_free_under_limit_passes(self) -> None:
        with (
            patch(
                "services.entitlement_service.user_repository.get_user",
                new=AsyncMock(return_value=_user()),
            ),
            patch(
                "services.entitlement_service.trips_repository.count_active",
                new=AsyncMock(return_value=1),
            ),
        ):
            asyncio.run(entitlement_service.assert_can_add_active_trip("uid-a"))


class CheckoutMockTest(unittest.TestCase):
    def test_upgrade_sets_pro(self) -> None:
        pro = _user(
            tier=SubscriptionTier.PRO,
            premium_until=datetime.now(UTC) + timedelta(days=365),
        )
        with (
            patch(
                "services.checkout_service.user_repository.get_user",
                new=AsyncMock(return_value=_user()),
            ),
            patch(
                "services.checkout_service.user_repository.update_subscription",
                new=AsyncMock(return_value=pro),
            ) as update,
        ):
            result = asyncio.run(checkout_service.upgrade("uid-a"))
        self.assertTrue(result.is_premium)
        self.assertEqual(result.tier, SubscriptionTier.PRO)
        update.assert_awaited_once()
        args = update.await_args.args
        self.assertEqual(args[0], "uid-a")
        self.assertEqual(args[1], SubscriptionTier.PRO)
        self.assertIsNotNone(args[2])

    def test_cancel_sets_free(self) -> None:
        free = _user()
        with (
            patch(
                "services.checkout_service.user_repository.get_user",
                new=AsyncMock(
                    return_value=_user(tier=SubscriptionTier.PRO, premium_until=None)
                ),
            ),
            patch(
                "services.checkout_service.user_repository.update_subscription",
                new=AsyncMock(return_value=free),
            ) as update,
        ):
            result = asyncio.run(checkout_service.cancel("uid-a"))
        self.assertFalse(result.is_premium)
        self.assertEqual(result.tier, SubscriptionTier.FREE)
        update.assert_awaited_once_with("uid-a", SubscriptionTier.FREE, None)

    def test_upgrade_disabled_503(self) -> None:
        with patch("services.checkout_service.settings") as settings:
            settings.CHECKOUT_MOCK_ENABLED = False
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(checkout_service.upgrade("uid-a"))
        self.assertEqual(ctx.exception.status_code, 503)
