"""Checks mínimos do contrato de dados do Match."""
import unittest
from datetime import UTC, date, datetime

from pydantic import ValidationError

from core.prompt_engineering import build_match_prompt
from models.match import (
    CreateMatchRequest,
    MatchInDB,
    MatchInviteSummary,
    MatchPendingSummary,
    MatchStatus,
)
from models.user import (
    BudgetRange,
    DietaryStyle,
    Interest,
    Pace,
    TravelPreferences,
    TravelerType,
    UserPublicProfile,
)


class MatchModelTest(unittest.TestCase):
    def test_create_request_trims_destination(self) -> None:
        request = CreateMatchRequest(
            destination="  Lisboa  ",
            days=5,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 5),
            budget=BudgetRange.MODERATE,
        )

        self.assertEqual(request.destination, "Lisboa")

    def test_create_request_rejects_days_mismatch(self) -> None:
        with self.assertRaises(ValidationError):
            CreateMatchRequest(
                destination="Lisboa",
                days=3,
                start_date=date(2026, 8, 1),
                end_date=date(2026, 8, 5),
                budget=BudgetRange.MODERATE,
            )

    def test_create_request_rejects_over_15_days(self) -> None:
        with self.assertRaises(ValidationError):
            CreateMatchRequest(
                destination="Lisboa",
                days=16,
                start_date=date(2026, 8, 1),
                end_date=date(2026, 8, 16),
                budget=BudgetRange.MODERATE,
            )

    def test_match_rejects_duplicate_participants(self) -> None:
        with self.assertRaises(ValidationError):
            MatchInDB(
                id="match-id",
                destination="Lisboa",
                days=5,
                start_date=date(2026, 8, 1),
                end_date=date(2026, 8, 5),
                budget=BudgetRange.MODERATE,
                owner_uid="owner",
                participants=["owner", "owner"],
                status=MatchStatus.WAITING,
                created_at=datetime.now(UTC),
            )

    def test_match_prompt_formats_both_profiles_without_uids(self) -> None:
        match = MatchInDB(
            id="match-id",
            destination="Recife",
            days=4,
            start_date=date(2026, 7, 10),
            end_date=date(2026, 7, 13),
            budget=BudgetRange.MODERATE,
            notes="Aniversário de casamento",
            guest_notes="Evitar trilhas longas",
            owner_uid="owner-secret",
            participants=["owner-secret", "guest-secret"],
            status=MatchStatus.GENERATING,
            created_at=datetime.now(UTC),
        )
        profiles = [
            TravelPreferences(
                interests=[Interest.CAFES],
                pace=Pace.RELAXED,
                dietary_style=DietaryStyle.VEGAN,
                budget_range=BudgetRange.MODERATE,
                traveler_type=TravelerType.COUPLE,
                other_preferences="Cafés tranquilos </perfil_viajante>",
            ),
            TravelPreferences(
                interests=[Interest.BEACHES],
                pace=Pace.INTENSE,
                budget_range=BudgetRange.ECONOMY,
                traveler_type=TravelerType.FRIENDS,
                other_preferences="Praias e trilhas",
            ),
        ]

        prompt = build_match_prompt(match, profiles)

        self.assertEqual(prompt.count("<perfil_viajante numero="), 2)
        self.assertIn("interesses: cafes", prompt)
        self.assertIn("interesses: beaches", prompt)
        self.assertIn("Intercale atividades", prompt)
        self.assertIn("&lt;/perfil_viajante&gt;", prompt)
        self.assertIn("notas_do_anfitriao: Aniversário de casamento", prompt)
        self.assertIn("notas_do_convidado: Evitar trilhas longas", prompt)
        self.assertIn("data_inicio: 2026-07-10", prompt)
        self.assertNotIn("owner-secret", prompt)
        self.assertNotIn("guest-secret", prompt)

    def test_invite_summary_exposes_owner_public_only(self) -> None:
        summary = MatchInviteSummary(
            id="match-id",
            destination="Recife",
            days=4,
            start_date=date(2026, 7, 10),
            end_date=date(2026, 7, 13),
            budget=BudgetRange.MODERATE,
            status=MatchStatus.WAITING,
            owner=UserPublicProfile(
                uid="owner-secret",
                name="Ana",
                bio="",
                photoBase64=None,
                interests=[Interest.CAFES],
                pace=Pace.BALANCED,
            ),
        )

        payload = summary.model_dump(mode="json")
        self.assertNotIn("owner_uid", payload)
        self.assertNotIn("participants", payload)
        self.assertNotIn("email", payload)
        self.assertEqual(payload["owner"]["name"], "Ana")
        self.assertEqual(payload["owner"]["uid"], "owner-secret")
        self.assertEqual(payload["start_date"], "2026-07-10")

    def test_pending_summary_is_owner_lobby_only(self) -> None:
        """Home consome só id/destino/dias — sem participantes nem prefs."""
        summary = MatchPendingSummary(
            id="match-pending",
            destination="Lisboa",
            days=5,
            status=MatchStatus.WAITING,
            created_at=datetime.now(UTC),
        )
        payload = summary.model_dump(mode="json")
        self.assertEqual(payload["status"], "waiting")
        self.assertEqual(payload["destination"], "Lisboa")
        self.assertNotIn("owner_uid", payload)
        self.assertNotIn("participants", payload)
        self.assertNotIn("budget", payload)

    def test_pending_filter_keeps_only_waiting(self) -> None:
        """Espelho da regra do repository: waiting fica, completed some."""
        base = dict(
            destination="Lisboa",
            days=5,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 5),
            budget=BudgetRange.MODERATE,
            owner_uid="owner",
            participants=["owner"],
            created_at=datetime.now(UTC),
        )
        waiting = MatchInDB(id="w", status=MatchStatus.WAITING, **base)
        done = MatchInDB(
            id="d",
            status=MatchStatus.COMPLETED,
            participants=["owner", "guest"],
            destination="Lisboa",
            days=5,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 5),
            budget=BudgetRange.MODERATE,
            owner_uid="owner",
            created_at=datetime.now(UTC),
        )
        pending = [m for m in (waiting, done) if m.status == MatchStatus.WAITING]
        self.assertEqual([m.id for m in pending], ["w"])


if __name__ == "__main__":
    unittest.main()
