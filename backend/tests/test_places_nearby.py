"""Nearby: raio por modo, mapa de interesses e o POST da Places (New). Sem rede."""
import unittest
from unittest.mock import patch

from models.user import Interest, TransportMode
from services.places_service import (
    included_types_for,
    map_nearby_new,
    nearby_radius_meters,
    search_nearby,
)


class _Response:
    def __init__(self, status_code: int, payload: dict, text: str = "") -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self) -> dict:
        return self._payload


class _FakeClient:
    def __init__(self, post_response: _Response, get_response: _Response | None = None):
        self.posts: list[dict] = []
        self.gets: list[dict] = []
        self._post = post_response
        self._get = get_response

    async def post(self, url: str, json: dict | None = None, headers: dict | None = None):
        self.posts.append({"url": url, "json": json or {}, "headers": headers or {}})
        return self._post

    async def get(self, url: str, params: dict | None = None):
        self.gets.append({"url": url, "params": params or {}})
        assert self._get is not None
        return self._get


def _await(coro):
    import asyncio

    return asyncio.run(coro)


class NearbyPlacesTest(unittest.TestCase):
    def test_radius_follows_mode(self) -> None:
        self.assertEqual(nearby_radius_meters(TransportMode.WALKING), 1200)
        self.assertEqual(nearby_radius_meters(TransportMode.PUBLIC_TRANSIT), 2500)
        self.assertEqual(nearby_radius_meters(TransportMode.RIDE_HAIL), 2500)

    def test_interest_map_caps_at_five(self) -> None:
        types = included_types_for(
            [
                Interest.ART_MUSEUMS,
                Interest.CAFES,
                Interest.BARS,
                Interest.WELLNESS,
                Interest.SHOPPING,
                Interest.STREET_FOOD,
            ]
        )
        self.assertEqual(
            types,
            ["museum", "art_gallery", "cafe", "bar", "spa"],
        )
        self.assertEqual(included_types_for([]), ["tourist_attraction"])
        self.assertEqual(
            included_types_for([Interest.HISTORY_ARCHITECTURE]),
            ["historical_landmark"],
        )
        self.assertEqual(
            included_types_for([Interest.BEACHES]),
            ["tourist_attraction"],
        )

    def test_maps_new_payload(self) -> None:
        places = map_nearby_new(
            {
                "places": [
                    {
                        "id": "ChIJmuseum1234567890",
                        "displayName": {"text": "Museu do Azulejo"},
                        "primaryTypeDisplayName": {"text": "Museu"},
                        "location": {"latitude": 38.72, "longitude": -9.11},
                    },
                    {"id": "sem-nome"},
                ]
            }
        )
        self.assertEqual(len(places), 1)
        self.assertEqual(places[0].name, "Museu do Azulejo")
        self.assertEqual(places[0].type_label, "Museu")
        self.assertEqual(places[0].latitude, 38.72)

    def test_search_sends_radius_and_types(self) -> None:
        client = _FakeClient(
            _Response(
                200,
                {
                    "places": [
                        {
                            "id": "ChIJmuseum1234567890",
                            "displayName": {"text": "Museu"},
                            "primaryTypeDisplayName": {"text": "Museu"},
                            "location": {"latitude": 38.72, "longitude": -9.11},
                        }
                    ]
                },
            )
        )

        async def _run():
            return await search_nearby(
                lat=38.72,
                lng=-9.14,
                travel_mode=TransportMode.WALKING,
                interests=[Interest.ART_MUSEUMS],
                client=client,  # type: ignore[arg-type]
            )

        with patch("services.places_service.settings.GOOGLE_MAPS_API_KEY", "test-key"):
            result = _await(_run())

        self.assertEqual(result.radius_meters, 1200)
        self.assertEqual(len(result.places), 1)
        body = client.posts[0]["json"]
        self.assertEqual(body["includedTypes"], ["museum", "art_gallery"])
        self.assertEqual(body["maxResultCount"], 8)
        self.assertEqual(body["rankPreference"], "DISTANCE")
        self.assertEqual(body["locationRestriction"]["circle"]["radius"], 1200.0)
        self.assertEqual(
            client.posts[0]["headers"]["X-Goog-FieldMask"],
            "places.id,places.displayName,places.primaryTypeDisplayName,places.location",
        )
        self.assertEqual(len(client.gets), 0)

    def test_falls_back_to_legacy_on_403(self) -> None:
        client = _FakeClient(
            _Response(
                403,
                {},
                text='{"error":{"status":"PERMISSION_DENIED","message":"blocked"}}',
            ),
            _Response(
                200,
                {
                    "status": "OK",
                    "results": [
                        {
                            "place_id": "ChIJcafe12345678901",
                            "name": "Café",
                            "types": ["cafe", "establishment"],
                            "geometry": {"location": {"lat": 38.71, "lng": -9.14}},
                        }
                    ],
                },
            ),
        )

        async def _run():
            return await search_nearby(
                lat=38.71,
                lng=-9.14,
                travel_mode=TransportMode.RIDE_HAIL,
                interests=[Interest.CAFES],
                client=client,  # type: ignore[arg-type]
            )

        with patch("services.places_service.settings.GOOGLE_MAPS_API_KEY", "test-key"):
            result = _await(_run())

        self.assertEqual(result.radius_meters, 2500)
        self.assertEqual(result.places[0].name, "Café")
        self.assertEqual(result.places[0].type_label, "cafe")
        self.assertEqual(client.gets[0]["params"]["type"], "cafe")
        self.assertEqual(client.gets[0]["params"]["radius"], 2500)
