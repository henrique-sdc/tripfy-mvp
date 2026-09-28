"""Routes: parser, atalho < 40 m, fan-out de trânsito e cache. Sem rede."""
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from models.routes import CalculateRoutesRequest, RouteStop
from models.user import TransportMode
from services.routes_service import (
    build_compute_body,
    calculate_routes,
    clear_route_cache,
    parse_compute_routes,
    parse_duration_seconds,
)


class _Response:
    def __init__(self, status_code: int, payload: dict, text: str = "") -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self) -> dict:
        return self._payload


class _FakeClient:
    def __init__(self, status_code: int = 200) -> None:
        self.calls: list[dict] = []
        self.status_code = status_code

    async def post(self, url: str, json: dict | None = None, headers: dict | None = None):
        body = json or {}
        self.calls.append({"url": url, "json": body, "headers": headers or {}})
        count = 1 + len(body.get("intermediates") or [])
        legs = [{"distanceMeters": 1200, "duration": "900s"} for _ in range(count)]
        return _Response(self.status_code, {"routes": [{"legs": legs}]})


def _stop(lat: float, lng: float) -> RouteStop:
    return RouteStop(latitude=lat, longitude=lng)


class RoutesServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        clear_route_cache()
        self._key = patch(
            "services.routes_service.settings.GOOGLE_MAPS_API_KEY",
            "test-key",
        )
        self._key.start()

    def tearDown(self) -> None:
        self._key.stop()
        clear_route_cache()

    def test_parse_duration_and_fixture(self) -> None:
        self.assertEqual(parse_duration_seconds("900s"), 900)
        self.assertEqual(parse_duration_seconds("123.9s"), 123)
        legs = parse_compute_routes(
            {
                "routes": [
                    {
                        "legs": [
                            {"distanceMeters": 1200, "duration": "900s"},
                            {"distanceMeters": 80, "duration": "60s"},
                        ]
                    }
                ]
            },
            expected=2,
        )
        self.assertEqual(legs[0].distance_meters, 1200)
        self.assertEqual(legs[0].duration_seconds, 900)
        self.assertEqual(legs[1].distance_meters, 80)

    def test_short_pair_skips_http(self) -> None:
        client = _FakeClient()

        async def _run():
            return await calculate_routes(
                CalculateRoutesRequest(
                    travel_mode=TransportMode.WALKING,
                    stops=[_stop(38.72, -9.14), _stop(38.72, -9.14)],
                ),
                client=client,
            )

        result = _await(_run())
        self.assertEqual(len(client.calls), 0)
        self.assertEqual(result.legs[0].distance_meters, 0)
        self.assertEqual(result.legs[0].duration_seconds, 60)

    def test_walk_one_call_with_intermediate(self) -> None:
        client = _FakeClient()

        async def _run():
            return await calculate_routes(
                CalculateRoutesRequest(
                    travel_mode=TransportMode.WALKING,
                    stops=[
                        _stop(38.72, -9.14),
                        _stop(38.73, -9.14),
                        _stop(38.74, -9.13),
                    ],
                ),
                client=client,
            )

        result = _await(_run())
        self.assertEqual(len(client.calls), 1)
        body = client.calls[0]["json"]
        self.assertEqual(body["travelMode"], "WALK")
        self.assertNotIn("routingPreference", body)
        self.assertNotIn("departureTime", body)
        self.assertEqual(len(body["intermediates"]), 1)
        self.assertEqual(
            client.calls[0]["headers"]["X-Goog-FieldMask"],
            "routes.legs.distanceMeters,routes.legs.duration",
        )
        self.assertEqual(len(result.legs), 2)
        self.assertEqual(result.legs[0].duration_seconds, 900)

    def test_drive_sets_traffic_unaware(self) -> None:
        body = build_compute_body(
            [_stop(38.72, -9.14), _stop(38.80, -9.10)],
            TransportMode.RIDE_HAIL,
        )
        self.assertEqual(body["travelMode"], "DRIVE")
        self.assertEqual(body["routingPreference"], "TRAFFIC_UNAWARE")

    def test_transit_fans_out_without_intermediates(self) -> None:
        client = _FakeClient()

        async def _run():
            return await calculate_routes(
                CalculateRoutesRequest(
                    travel_mode=TransportMode.PUBLIC_TRANSIT,
                    stops=[
                        _stop(38.72, -9.14),
                        _stop(38.73, -9.14),
                        _stop(38.74, -9.13),
                    ],
                ),
                client=client,
            )

        result = _await(_run())
        self.assertEqual(len(client.calls), 2)
        for call in client.calls:
            self.assertEqual(call["json"]["travelMode"], "TRANSIT")
            self.assertNotIn("intermediates", call["json"])
            self.assertIn("departureTime", call["json"])
        self.assertEqual(len(result.legs), 2)

    def test_second_call_hits_cache(self) -> None:
        client = _FakeClient()
        request = CalculateRoutesRequest(
            travel_mode=TransportMode.WALKING,
            stops=[_stop(38.72, -9.14), _stop(38.80, -9.10)],
        )

        async def _run():
            await calculate_routes(request, client=client)
            await calculate_routes(request, client=client)

        _await(_run())
        self.assertEqual(len(client.calls), 1)

    def test_missing_key_is_503(self) -> None:
        async def _run():
            await calculate_routes(
                CalculateRoutesRequest(
                    travel_mode=TransportMode.WALKING,
                    stops=[_stop(38.72, -9.14), _stop(38.80, -9.10)],
                ),
                client=_FakeClient(),
            )

        with patch("services.routes_service.settings.GOOGLE_MAPS_API_KEY", ""):
            with self.assertRaises(HTTPException) as ctx:
                _await(_run())
        self.assertEqual(ctx.exception.status_code, 503)

    def test_google_error_is_502(self) -> None:
        async def _run():
            await calculate_routes(
                CalculateRoutesRequest(
                    travel_mode=TransportMode.WALKING,
                    stops=[_stop(38.72, -9.14), _stop(38.80, -9.10)],
                ),
                client=_FakeClient(status_code=500),
            )

        with self.assertRaises(HTTPException) as ctx:
            _await(_run())
        self.assertEqual(ctx.exception.status_code, 502)

    def test_routes_blocked_falls_back_to_directions(self) -> None:
        client = _DirectionsFallbackClient()

        async def _run():
            return await calculate_routes(
                CalculateRoutesRequest(
                    travel_mode=TransportMode.WALKING,
                    stops=[
                        _stop(38.72, -9.14),
                        _stop(38.73, -9.14),
                        _stop(38.74, -9.13),
                    ],
                ),
                client=client,
            )

        result = _await(_run())
        self.assertEqual(client.posts, 1)
        self.assertEqual(len(client.gets), 1)
        params = client.gets[0]
        self.assertEqual(params["mode"], "walking")
        self.assertIn("waypoints", params)
        self.assertNotIn("optimize:true", params["waypoints"])
        self.assertEqual(len(result.legs), 2)
        self.assertEqual(result.legs[0].distance_meters, 1500)
        self.assertEqual(result.legs[0].duration_seconds, 700)


class _DirectionsFallbackClient:
    def __init__(self) -> None:
        self.posts = 0
        self.gets: list[dict] = []

    async def post(self, url: str, json: dict | None = None, headers: dict | None = None):
        self.posts += 1
        return _Response(
            403,
            {},
            text='{"error":{"status":"PERMISSION_DENIED","message":"Routes API has not been used"}}',
        )

    async def get(self, url: str, params: dict | None = None):
        self.gets.append(params or {})
        return _Response(
            200,
            {
                "status": "OK",
                "routes": [
                    {
                        "legs": [
                            {
                                "distance": {"value": 1500},
                                "duration": {"value": 700},
                            },
                            {
                                "distance": {"value": 800},
                                "duration": {"value": 400},
                            },
                        ]
                    }
                ],
            },
        )


def _await(coro):
    import asyncio

    return asyncio.run(coro)
