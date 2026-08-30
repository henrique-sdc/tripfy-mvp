"""Checks do mapeamento Places New + legacy + place_id + validação."""
import unittest

from fastapi import HTTPException
from pydantic import ValidationError

from models.review import PlaceReviewCreate
from services.places_service import (
    _is_places_new_blocked,
    extract_place_id_new,
    map_legacy_details_to_full,
    map_legacy_result_to_details,
    map_new_details_to_full,
    map_place_to_details,
    validate_place_id,
)


class PlacesMappingTest(unittest.TestCase):
    def test_maps_full_payload_with_place_id(self) -> None:
        place = {
            "id": "ChIJtest1234567890",
            "rating": 4.7,
            "userRatingCount": 1280,
            "currentOpeningHours": {"openNow": True},
            "location": {"latitude": -23.55, "longitude": -46.63},
        }
        details = map_place_to_details(place, "https://lh3.googleusercontent.com/x")

        self.assertEqual(details.place_id, "ChIJtest1234567890")
        self.assertEqual(details.photo_url, "https://lh3.googleusercontent.com/x")
        self.assertEqual(details.rating, 4.7)
        self.assertEqual(details.reviews_count, 1280)
        self.assertTrue(details.open_now)
        self.assertEqual(details.latitude, -23.55)
        self.assertEqual(details.longitude, -46.63)

    def test_extract_place_id_from_resource_name(self) -> None:
        self.assertEqual(
            extract_place_id_new({"name": "places/ChIJabcdef1234567890"}),
            "ChIJabcdef1234567890",
        )

    def test_tolerates_missing_fields(self) -> None:
        details = map_place_to_details({}, None)

        self.assertIsNone(details.place_id)
        self.assertIsNone(details.photo_url)
        self.assertIsNone(details.rating)
        self.assertIsNone(details.reviews_count)
        self.assertIsNone(details.open_now)
        self.assertIsNone(details.latitude)
        self.assertIsNone(details.longitude)

    def test_maps_legacy_payload(self) -> None:
        result = {
            "place_id": "ChIJlegacy1234567890",
            "rating": 4.2,
            "user_ratings_total": 90,
            "opening_hours": {"open_now": False},
            "geometry": {"location": {"lat": 38.7, "lng": -9.1}},
        }
        details = map_legacy_result_to_details(result, None)
        self.assertEqual(details.place_id, "ChIJlegacy1234567890")
        self.assertEqual(details.rating, 4.2)
        self.assertEqual(details.reviews_count, 90)
        self.assertFalse(details.open_now)
        self.assertEqual(details.latitude, 38.7)
        self.assertEqual(details.longitude, -9.1)

    def test_detects_new_api_blocked(self) -> None:
        self.assertTrue(
            _is_places_new_blocked(
                403,
                '{"error":{"status":"PERMISSION_DENIED","message":"Places API (New) has not been used"}}',
            )
        )
        self.assertFalse(_is_places_new_blocked(500, "boom"))

    def test_validate_place_id(self) -> None:
        self.assertEqual(
            validate_place_id("places/ChIJabcdef1234567890"),
            "ChIJabcdef1234567890",
        )
        with self.assertRaises(HTTPException) as ctx:
            validate_place_id("../evil")
        self.assertEqual(ctx.exception.status_code, 422)

    def test_map_new_full_details(self) -> None:
        place = {
            "id": "ChIJfull1234567890ab",
            "displayName": {"text": "East Side Gallery"},
            "formattedAddress": "Mühlenstraße, Berlin",
            "nationalPhoneNumber": "+49 30 123",
            "websiteUri": "https://example.com",
            "editorialSummary": {"text": "Muro com arte."},
            "regularOpeningHours": {
                "weekdayDescriptions": ["Monday: Open 24 hours"]
            },
            "currentOpeningHours": {"openNow": True},
            "rating": 4.6,
            "userRatingCount": 9000,
            "location": {"latitude": 52.5, "longitude": 13.4},
            "priceLevel": "PRICE_LEVEL_MODERATE",
            "menuUri": "https://example.com/cardapio",
        }
        full = map_new_details_to_full(
            place, "ChIJfull1234567890ab", ["https://lh3.googleusercontent.com/a"]
        )
        self.assertEqual(full.name, "East Side Gallery")
        self.assertEqual(full.weekday_text, ["Monday: Open 24 hours"])
        self.assertEqual(full.latitude, 52.5)
        self.assertEqual(len(full.photo_urls), 1)
        self.assertEqual(full.price_level, "$$")
        self.assertEqual(full.menu_uri, "https://example.com/cardapio")

    def test_map_legacy_full_details(self) -> None:
        result = {
            "place_id": "ChIJlegfull123456789",
            "name": "Café",
            "formatted_address": "Berlin",
            "opening_hours": {
                "open_now": False,
                "weekday_text": ["Domingo: fechado"],
            },
            "geometry": {"location": {"lat": 52.1, "lng": 13.2}},
            "price_level": 2,
        }
        full = map_legacy_details_to_full(result, "ChIJlegfull123456789", [])
        self.assertEqual(full.name, "Café")
        self.assertFalse(full.open_now)
        self.assertEqual(full.longitude, 13.2)
        self.assertEqual(full.price_level, "$$")
        self.assertIsNone(full.menu_uri)


class PlaceReviewModelTest(unittest.TestCase):
    def test_create_trims_comment(self) -> None:
        body = PlaceReviewCreate(rating=5, comment="  Ótimo lugar  ")
        self.assertEqual(body.comment, "Ótimo lugar")
        self.assertEqual(body.place_name, "")

        named = PlaceReviewCreate(
            rating=4,
            comment="Bom",
            place_name="  Café Central  ",
        )
        self.assertEqual(named.place_name, "Café Central")

    def test_create_rejects_blank_comment(self) -> None:
        with self.assertRaises(ValidationError):
            PlaceReviewCreate(rating=3, comment="   ")

    def test_create_rejects_rating_out_of_range(self) -> None:
        with self.assertRaises(ValidationError):
            PlaceReviewCreate(rating=0, comment="x")


if __name__ == "__main__":
    unittest.main()
