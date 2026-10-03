"""Semana UTC e o contador do Em alta."""
import unittest
from datetime import datetime, timezone

from services.explore_week import apply_week_save, utc_week_id


class UtcWeekIdTest(unittest.TestCase):
    def test_ano_iso_vira_no_comeco_de_janeiro(self) -> None:
        moment = datetime(2021, 1, 1, 15, tzinfo=timezone.utc)
        self.assertEqual(utc_week_id(moment), "2020-W53")

    def test_sabado_de_outubro(self) -> None:
        moment = datetime(2026, 10, 3, 3, tzinfo=timezone.utc)
        self.assertEqual(utc_week_id(moment), "2026-W40")


class ApplyWeekSaveTest(unittest.TestCase):
    def test_semana_nova_zera_e_conta_um(self) -> None:
        fields = apply_week_save(
            {"week_id": "2026-W39", "week_saves": 9},
            add=1,
            week="2026-W40",
        )
        self.assertEqual(fields, {"week_id": "2026-W40", "week_saves": 1})

    def test_mesma_semana_soma(self) -> None:
        fields = apply_week_save(
            {"week_id": "2026-W40", "week_saves": 2},
            add=1,
            week="2026-W40",
        )
        self.assertEqual(fields["week_saves"], 3)

    def test_desfazer_na_semana_diminui(self) -> None:
        fields = apply_week_save(
            {"week_id": "2026-W40", "week_saves": 2},
            add=-1,
            week="2026-W40",
        )
        self.assertEqual(fields["week_saves"], 1)

    def test_desfazer_nao_fica_negativo(self) -> None:
        fields = apply_week_save(
            {"week_id": "2026-W40", "week_saves": 0},
            add=-1,
            week="2026-W40",
        )
        self.assertEqual(fields["week_saves"], 0)

    def test_desfazer_de_outra_semana_nao_mexe(self) -> None:
        self.assertEqual(
            apply_week_save(
                {"week_id": "2026-W40", "week_saves": 4},
                add=-1,
                week="2026-W39",
            ),
            {},
        )
