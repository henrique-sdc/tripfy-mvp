"""
Checks mínimos do soft-delete / janela da lixeira (Fase 3).
"""
import unittest
from datetime import datetime, timedelta, timezone

from repositories.trips_repository import _is_in_trash_window, _itinerary_payload


class TripsRepositoryHelpersTest(unittest.TestCase):
    def test_trash_window_accepts_recent(self) -> None:
        recent = datetime.now(timezone.utc) - timedelta(days=5)
        self.assertTrue(_is_in_trash_window(recent))

    def test_trash_window_rejects_old(self) -> None:
        old = datetime.now(timezone.utc) - timedelta(days=31)
        self.assertFalse(_is_in_trash_window(old))

    def test_trash_window_rejects_none(self) -> None:
        self.assertFalse(_is_in_trash_window(None))

    def test_itinerary_payload_strips_meta(self) -> None:
        payload = _itinerary_payload(
            {
                "destination": "Lisboa",
                "summary": "Sol",
                "owner_uid": "abc",
                "deleted_at": "x",
                "days": [
                    {
                        "day": 1,
                        "title": "Centro",
                        "activities": [
                            {
                                "time": "09:00",
                                "title": "Café",
                                "description": "x",
                                "location": "Baixa",
                                "latitude": 38.7,
                                "longitude": -9.1,
                            }
                        ],
                    }
                ],
            }
        )
        self.assertEqual(payload["destination"], "Lisboa")
        self.assertNotIn("owner_uid", payload)
        self.assertEqual(len(payload["days"][0]["activities"]), 1)


if __name__ == "__main__":
    unittest.main()
