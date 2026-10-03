"""Hash da vibe e a janela de 4 dias."""
import unittest
from datetime import date

from models.user import (
    BudgetRange,
    DietaryStyle,
    Interest,
    Pace,
    TravelPreferences,
    TravelerType,
)
from services.vibe_window import four_day_window, next_monday, prefs_key


def _prefs(**overrides: object) -> TravelPreferences:
    data = {
        "interests": [Interest.BEACHES],
        "pace": Pace.BALANCED,
        "transport_modes": [],
        "dietary_style": DietaryStyle.NONE,
        "budget_range": BudgetRange.MODERATE,
        "traveler_type": TravelerType.SOLO,
        "other_preferences": "",
    }
    data.update(overrides)
    return TravelPreferences.model_validate(data)


class VibePicksPureTest(unittest.TestCase):
    def test_hash_muda_com_o_gosto(self) -> None:
        base = prefs_key(_prefs())
        changed = prefs_key(_prefs(other_preferences="trilhas"))
        self.assertNotEqual(base, changed)
        self.assertEqual(base, prefs_key(_prefs()))

    def test_proxima_segunda_pula_o_proprio_dia(self) -> None:
        monday = date(2026, 10, 5)
        self.assertEqual(next_monday(monday), date(2026, 10, 12))

    def test_sabado_cai_na_segunda_seguinte(self) -> None:
        start, end = four_day_window(date(2026, 10, 3))
        self.assertEqual(start, date(2026, 10, 5))
        self.assertEqual(end, date(2026, 10, 8))
        self.assertEqual((end - start).days + 1, 4)
