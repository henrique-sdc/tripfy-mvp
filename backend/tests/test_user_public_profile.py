"""Checks mínimos do contrato de perfil público e regra self-add."""
import asyncio
import unittest
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from models.user import (
    BudgetRange,
    DietaryStyle,
    Interest,
    Pace,
    TravelPreferences,
    TravelerType,
    UserInDB,
    UserPublicProfile,
)
from repositories.user_repository import public_profile_from_user
from services import user_service


def _prefs() -> TravelPreferences:
    return TravelPreferences(
        interests=[Interest.CAFES, Interest.BEACHES],
        pace=Pace.BALANCED,
        transport_modes=[],
        dietary_style=DietaryStyle.VEGAN,
        budget_range=BudgetRange.PREMIUM,
        traveler_type=TravelerType.SOLO,
        other_preferences="segredo privado",
    )


class UserPublicProfileTest(unittest.TestCase):
    def test_projection_omits_sensitive_fields(self) -> None:
        user = UserInDB(
            uid="uid-a",
            email="a@example.com",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
            name="Ana",
            bio="Viajante",
            photoBase64="abc",
            companions=["uid-x"],
            travel_preferences=_prefs(),
        )

        profile = public_profile_from_user(user)
        dumped = profile.model_dump()

        self.assertEqual(
            profile,
            UserPublicProfile(
                uid="uid-a",
                name="Ana",
                bio="Viajante",
                photoBase64="abc",
                interests=[Interest.CAFES, Interest.BEACHES],
                pace=Pace.BALANCED,
            ),
        )
        self.assertNotIn("email", dumped)
        self.assertNotIn("created_at", dumped)
        self.assertNotIn("companions", dumped)
        self.assertNotIn("budget_range", dumped)
        self.assertNotIn("dietary_style", dumped)
        self.assertNotIn("other_preferences", dumped)

    def test_projection_without_prefs(self) -> None:
        user = UserInDB(
            uid="uid-b",
            email="b@example.com",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
            travel_preferences=None,
        )

        profile = public_profile_from_user(user)

        self.assertEqual(profile.interests, [])
        self.assertIsNone(profile.pace)
        self.assertEqual(profile.name, "")
        self.assertIsNone(profile.photoBase64)

    def test_add_companion_rejects_self(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(user_service.add_companion("same-uid", "same-uid"))

        self.assertEqual(ctx.exception.status_code, 400)

    def test_add_companion_rejects_missing_target(self) -> None:
        with patch(
            "services.user_service.user_repository.get_user",
            new_callable=AsyncMock,
            return_value=None,
        ):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(user_service.add_companion("me", "missing"))

        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
