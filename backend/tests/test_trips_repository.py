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
                "match_id": "match-xyz",
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
        self.assertNotIn("match_id", payload)
        self.assertEqual(len(payload["days"][0]["activities"]), 1)
        self.assertFalse(payload["days"][0]["activities"][0]["requires_ticket"])
        self.assertIsNone(payload["start_date"])
        self.assertIsNone(payload["end_date"])

    def test_itinerary_payload_copies_dates_and_ticket(self) -> None:
        payload = _itinerary_payload(
            {
                "destination": "Lisboa",
                "summary": "Sol",
                "owner_uid": "abc",
                "start_date": "2026-07-10",
                "end_date": "2026-07-15",
                "days": [
                    {
                        "day": 1,
                        "title": "Belém",
                        "activities": [
                            {
                                "time": "10:00",
                                "title": "Jerónimos",
                                "description": "x",
                                "location": "Belém",
                                "requires_ticket": True,
                            }
                        ],
                    }
                ],
            }
        )
        self.assertEqual(payload["start_date"], "2026-07-10")
        self.assertEqual(payload["end_date"], "2026-07-15")
        self.assertTrue(payload["days"][0]["activities"][0]["requires_ticket"])


if __name__ == "__main__":
    unittest.main()
