"""
Trava de ouro do Modo Viagem — helpers puros (sem Firebase).
"""
import unittest

from models.trip import (
    ItineraryResponse,
    PersistedActivity,
    PersistedDay,
    SavedTripResponse,
    has_completed_place,
    user_has_completed_place,
)


class TravelModeGateTest(unittest.TestCase):
    def test_has_completed_place_requires_flag_and_id(self) -> None:
        days = [
            PersistedDay(
                day=1,
                title="Centro",
                activities=[
                    PersistedActivity(
                        time="09:00",
                        title="Café",
                        description="x",
                        location="Baixa",
                        completed=True,
                        place_id="ChIJ1234567890",
                    ),
                    PersistedActivity(
                        time="11:00",
                        title="Miradouro",
                        description="x",
                        location="Alfama",
                        completed=False,
                        place_id="ChIJ9999999999",
                    ),
                ],
            )
        ]
        self.assertTrue(has_completed_place(days, "ChIJ1234567890"))
        self.assertFalse(has_completed_place(days, "ChIJ9999999999"))
        self.assertFalse(has_completed_place(days, "ChIJ0000000000"))

    def test_user_has_completed_place_scans_trips(self) -> None:
        trip = SavedTripResponse(
            id="t1",
            owner_uid="u1",
            destination="Lisboa",
            summary="Sol",
            days=[
                PersistedDay(
                    day=1,
                    title="Centro",
                    activities=[
                        PersistedActivity(
                            time="09:00",
                            title="Café",
                            description="x",
                            location="Baixa",
                            completed=True,
                            place_id="ChIJ1234567890",
                        )
                    ],
                )
            ],
        )
        self.assertTrue(user_has_completed_place([trip], "ChIJ1234567890"))
        self.assertFalse(user_has_completed_place([trip], "ChIJ0000000000"))
        self.assertFalse(user_has_completed_place([], "ChIJ1234567890"))

    def test_llm_schema_excludes_travel_fields(self) -> None:
        schema = ItineraryResponse.model_json_schema()
        defs = schema.get("$defs") or schema.get("definitions") or {}
        props = defs["ActivityResponse"]["properties"]
        self.assertNotIn("completed", props)
        self.assertNotIn("place_id", props)
        persisted = PersistedActivity.model_json_schema()["properties"]
        self.assertIn("completed", persisted)
        self.assertIn("place_id", persisted)


if __name__ == "__main__":
    unittest.main()
