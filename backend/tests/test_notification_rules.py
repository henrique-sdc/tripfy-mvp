"""Janela do tick, avaliação sem place_id e o segredo do cron."""

import unittest
from datetime import UTC, date, datetime, timedelta

from models.trip import PersistedActivity, PersistedDay, SavedTripResponse
from models.user import PushDevice, PushPlatform, merge_push_devices
from services.notification_rules import (
    clamp_lookback,
    cron_secret_matches,
    is_outdoor,
    parse_hhmm,
    plan_trip_notices,
)


def _trip(
    *,
    time: str = "10:00",
    title: str = "Louvre",
    completed: bool = False,
    place_id: str | None = None,
    start: date | None = date(2026, 9, 27),
    end: date | None = date(2026, 9, 27),
) -> SavedTripResponse:
    return SavedTripResponse(
        id="trip1",
        owner_uid="ana",
        destination="Paris",
        summary="ok",
        start_date=start,
        end_date=end,
        days=[
            PersistedDay(
                day=1,
                title="Centro",
                activities=[
                    PersistedActivity(
                        id="act1",
                        time=time,
                        title=title,
                        description="visita",
                        location="Paris",
                        completed=completed,
                        place_id=place_id,
                    )
                ],
            )
        ],
    )


def _at(hour: int, minute: int) -> datetime:
    """Horário de parede em São Paulo, expresso em UTC (sem horário de verão)."""
    local = datetime(2026, 9, 27, hour, minute, tzinfo=UTC) + timedelta(hours=3)
    return local


class NotificationRulesTest(unittest.TestCase):
    def test_reminder_inside_window(self) -> None:
        notices = plan_trip_notices(
            _trip(),
            uid="ana",
            tz_name="America/Sao_Paulo",
            now_utc=_at(9, 35),
            lookback_minutes=15,
            rain_by_hour=None,
        )
        self.assertEqual([item.kind for item in notices], ["reminder"])
        self.assertIn("day=1", notices[0].url)
        self.assertIn("tripId=trip1", notices[0].url)
        self.assertNotIn("sheet=community", notices[0].url)

    def test_reminder_outside_window(self) -> None:
        notices = plan_trip_notices(
            _trip(),
            uid="ana",
            tz_name="America/Sao_Paulo",
            now_utc=_at(9, 0),
            lookback_minutes=15,
            rain_by_hour=None,
        )
        self.assertEqual(notices, [])

    def test_unparseable_time_is_skipped(self) -> None:
        notices = plan_trip_notices(
            _trip(time="manhã"),
            uid="ana",
            tz_name="America/Sao_Paulo",
            now_utc=_at(9, 35),
            lookback_minutes=15,
            rain_by_hour=None,
        )
        self.assertEqual(notices, [])

    def test_review_requires_completed_and_place_id(self) -> None:
        place = "ChIJabcdefg"
        base = dict(
            uid="ana",
            tz_name="America/Sao_Paulo",
            now_utc=_at(12, 5),
            lookback_minutes=15,
            rain_by_hour=None,
        )
        self.assertEqual(
            plan_trip_notices(_trip(completed=True, place_id=None), **base),
            [],
        )
        self.assertEqual(
            plan_trip_notices(_trip(completed=False, place_id=place), **base),
            [],
        )
        notices = plan_trip_notices(
            _trip(completed=True, place_id=place),
            **base,
        )
        self.assertEqual([item.kind for item in notices], ["review"])
        self.assertIn("sheet=community", notices[0].url)
        self.assertIn("placeId=", notices[0].url)

    def test_weather_only_for_outdoor_in_the_morning_window(self) -> None:
        rainy = {14: 80}
        outdoor = plan_trip_notices(
            _trip(time="14:00", title="Parque Ibirapuera"),
            uid="ana",
            tz_name="America/Sao_Paulo",
            now_utc=_at(7, 5),
            lookback_minutes=15,
            rain_by_hour=rainy,
        )
        self.assertEqual([item.kind for item in outdoor], ["weather"])

        indoor = plan_trip_notices(
            _trip(time="14:00", title="Museu do Louvre"),
            uid="ana",
            tz_name="America/Sao_Paulo",
            now_utc=_at(7, 5),
            lookback_minutes=15,
            rain_by_hour=rainy,
        )
        self.assertEqual(indoor, [])

        late = plan_trip_notices(
            _trip(time="14:00", title="Praia"),
            uid="ana",
            tz_name="America/Sao_Paulo",
            now_utc=_at(12, 0),
            lookback_minutes=15,
            rain_by_hour=rainy,
        )
        self.assertEqual(late, [])

    def test_cron_secret_fails_closed(self) -> None:
        self.assertFalse(cron_secret_matches("segredo", ""))
        self.assertFalse(cron_secret_matches(None, "segredo"))
        self.assertFalse(cron_secret_matches("outro", "segredo"))
        self.assertTrue(cron_secret_matches("segredo", "segredo"))

    def test_lookback_caps_at_forty_five(self) -> None:
        self.assertEqual(clamp_lookback(None), 15)
        self.assertEqual(clamp_lookback(10), 15)
        self.assertEqual(clamp_lookback(30), 31)
        self.assertEqual(clamp_lookback(200), 45)

    def test_parse_and_outdoor(self) -> None:
        self.assertEqual(parse_hhmm("9:00"), (9, 0))
        self.assertIsNone(parse_hhmm("24:00"))
        self.assertIsNone(parse_hhmm("manhã"))
        self.assertTrue(is_outdoor("Praça da Sé"))
        self.assertFalse(is_outdoor("Museu"))

    def test_merge_keeps_five_newest_devices(self) -> None:
        devices = [
            PushDevice(
                token=f"ExponentPushToken[old{i}]",
                platform=PushPlatform.IOS,
                timezone="America/Sao_Paulo",
                updated_at=datetime(2026, 1, i + 1, tzinfo=UTC),
            )
            for i in range(5)
        ]
        incoming = PushDevice(
            token="ExponentPushToken[new]",
            platform=PushPlatform.ANDROID,
            timezone="Europe/Lisbon",
            updated_at=datetime(2026, 2, 1, tzinfo=UTC),
        )
        merged = merge_push_devices(devices, incoming)
        self.assertEqual(len(merged), 5)
        self.assertEqual(merged[-1].token, incoming.token)
        self.assertNotIn(devices[0].token, [item.token for item in merged])


if __name__ == "__main__":
    unittest.main()
