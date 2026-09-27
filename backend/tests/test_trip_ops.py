"""Colisões da edição conjunta — delete x título, reorder x patch."""
import unittest

from services.trip_ops import TripOpError, apply_op, describe_change, stamp_activity_ids


def _state() -> dict:
    return {
        "revision": 5,
        "recent_op_ids": [],
        "last_op_id": None,
        "last_op_type": None,
        "destination": "Lisboa",
        "title": "",
        "summary": "Sol",
        "notes": "",
        "tips": [],
        "start_date": None,
        "end_date": None,
        "days": [
            {
                "day": 1,
                "title": "Centro",
                "activities": [
                    {
                        "id": "aaaaaaaa",
                        "time": "09:00",
                        "title": "Café",
                        "description": "x",
                        "location": "Baixa",
                    },
                    {
                        "id": "bbbbbbbb",
                        "time": "11:00",
                        "title": "Miradouro",
                        "description": "y",
                        "location": "Alfama",
                    },
                ],
            }
        ],
    }


def _op(typ: str, payload: dict, *, base: int = 5, op_id: str = "op-00001") -> dict:
    return {
        "op_id": op_id,
        "base_revision": base,
        "type": typ,
        "payload": payload,
    }


class TripOpsTest(unittest.TestCase):
    def test_stamp_preserves_existing_id(self) -> None:
        days = stamp_activity_ids(
            [
                {
                    "day": 1,
                    "title": "A",
                    "activities": [
                        {"id": "abcdefgh", "time": "09:00", "title": "Café"},
                        {"title": "Sem id"},
                    ],
                }
            ]
        )
        self.assertEqual(days[0]["activities"][0]["id"], "abcdefgh")
        self.assertTrue(days[0]["activities"][1]["id"])
        self.assertNotEqual(
            days[0]["activities"][1]["id"],
            days[0]["activities"][0]["id"],
        )

    def test_delete_then_patch_does_not_resurrect(self) -> None:
        state, wrote = apply_op(
            _state(),
            _op("delete_activity", {"activity_id": "aaaaaaaa"}, op_id="op-delete"),
        )
        self.assertTrue(wrote)
        self.assertEqual(len(state["days"][0]["activities"]), 1)
        with self.assertRaises(TripOpError) as ctx:
            apply_op(
                state,
                _op(
                    "patch_activity",
                    {"activity_id": "aaaaaaaa", "fields": {"title": "Novo"}},
                    base=5,
                    op_id="op-patch1",
                ),
            )
        self.assertEqual(ctx.exception.code, "activity_deleted")

    def test_delete_missing_is_idempotent(self) -> None:
        state = _state()
        state["days"][0]["activities"] = state["days"][0]["activities"][1:]
        # Ainda tem 1 — delete do id que já sumiu não pode esvaziar o dia.
        # Recoloca uma segunda parada pra passar do piso, e tira a primeira.
        state["days"][0]["activities"] = [
            state["days"][0]["activities"][0],
            {
                "id": "cccccccc",
                "time": "12:00",
                "title": "Outra",
                "description": "",
                "location": "",
            },
        ]
        next_state, wrote = apply_op(
            state,
            _op("delete_activity", {"activity_id": "aaaaaaaa"}),
        )
        self.assertFalse(wrote)
        self.assertEqual(next_state["revision"], 5)

    def test_patch_does_not_clobber_other_fields(self) -> None:
        state, _wrote = apply_op(
            _state(),
            _op(
                "patch_activity",
                {"activity_id": "aaaaaaaa", "fields": {"title": "Padaria"}},
            ),
        )
        act = state["days"][0]["activities"][0]
        self.assertEqual(act["title"], "Padaria")
        self.assertEqual(act["location"], "Baixa")
        self.assertEqual(act["time"], "09:00")

    def test_reorder_keeps_concurrent_add_and_drops_deleted(self) -> None:
        state = _state()
        state["days"][0]["activities"].append(
            {
                "id": "dddddddd",
                "time": "15:00",
                "title": "Nova",
                "description": "",
                "location": "",
            }
        )
        # Cliente reordenou sem ver dddddddd e ainda cita aaaaaaaa, que o
        # servidor já não tem se filtramos — aqui aaaaaaaa existe. O cliente
        # manda só bbbbbbbb (apagou aaaaaaaa na lista dele por engano de
        # snapshot). Id dddddddd fica na posição relativa.
        next_state, wrote = apply_op(
            state,
            _op(
                "reorder_day",
                {
                    "day": 1,
                    "activity_ids": ["bbbbbbbb"],
                    "times": {"bbbbbbbb": "09:00"},
                },
                base=4,
            ),
        )
        self.assertTrue(wrote)
        ids = [a["id"] for a in next_state["days"][0]["activities"]]
        self.assertIn("dddddddd", ids)
        self.assertIn("aaaaaaaa", ids)
        self.assertEqual(ids[0], "aaaaaaaa")
        self.assertEqual(
            next_state["days"][0]["activities"][1]["time"],
            "09:00",
        )

    def test_stale_patch_commutes_over_reorder(self) -> None:
        state = _state()
        state["revision"] = 6
        state["last_op_type"] = "reorder_day"
        next_state, wrote = apply_op(
            state,
            _op(
                "patch_activity",
                {"activity_id": "bbbbbbbb", "fields": {"title": "Vista"}},
                base=5,
                op_id="op-patch2",
            ),
        )
        self.assertTrue(wrote)
        self.assertEqual(next_state["revision"], 7)
        titles = [a["title"] for a in next_state["days"][0]["activities"]]
        self.assertIn("Vista", titles)
        self.assertIn("Café", titles)

    def test_meta_against_meta_conflicts(self) -> None:
        state = _state()
        state["revision"] = 6
        state["last_op_type"] = "patch_meta"
        with self.assertRaises(TripOpError) as ctx:
            apply_op(
                state,
                _op("patch_meta", {"notes": "do A"}, base=5, op_id="op-meta01"),
            )
        self.assertEqual(ctx.exception.code, "revision_conflict")

    def test_meta_commutes_over_reorder(self) -> None:
        state = _state()
        state["revision"] = 6
        state["last_op_type"] = "reorder_day"
        next_state, wrote = apply_op(
            state,
            _op("patch_meta", {"notes": "juntos"}, base=5, op_id="op-meta02"),
        )
        self.assertTrue(wrote)
        self.assertEqual(next_state["notes"], "juntos")
        self.assertEqual(len(next_state["days"][0]["activities"]), 2)

    def test_repeated_op_id_does_not_apply_twice(self) -> None:
        state, wrote = apply_op(
            _state(),
            _op(
                "patch_activity",
                {"activity_id": "aaaaaaaa", "fields": {"title": "Uma"}},
                op_id="op-same01",
            ),
        )
        self.assertTrue(wrote)
        again, wrote_again = apply_op(
            state,
            _op(
                "patch_activity",
                {"activity_id": "aaaaaaaa", "fields": {"title": "Duas"}},
                base=6,
                op_id="op-same01",
            ),
        )
        self.assertFalse(wrote_again)
        self.assertEqual(again["days"][0]["activities"][0]["title"], "Uma")
        self.assertEqual(again["revision"], 6)

    def test_reorder_then_patch_same_doc_order_survives(self) -> None:
        state, _ = apply_op(
            _state(),
            _op(
                "reorder_day",
                {
                    "day": 1,
                    "activity_ids": ["bbbbbbbb", "aaaaaaaa"],
                    "times": {"bbbbbbbb": "09:00", "aaaaaaaa": "11:00"},
                },
                op_id="op-reord1",
            ),
        )
        state, _ = apply_op(
            state,
            _op(
                "patch_activity",
                {"activity_id": "aaaaaaaa", "fields": {"title": "Padaria"}},
                base=6,
                op_id="op-patch3",
            ),
        )
        ids = [a["id"] for a in state["days"][0]["activities"]]
        self.assertEqual(ids, ["bbbbbbbb", "aaaaaaaa"])
        self.assertEqual(state["days"][0]["activities"][1]["title"], "Padaria")

    def test_describe_title_ignores_unchanged_notes(self) -> None:
        before = _state()
        after = _state()
        after["title"] = "Taiwan"
        kind, day = describe_change(
            before,
            after,
            _op("patch_meta", {"title": "Taiwan", "notes": "", "summary": "Sol"}),
        )
        self.assertEqual(kind, "title")
        self.assertIsNone(day)

    def test_describe_reorder_keeps_day(self) -> None:
        state = _state()
        kind, day = describe_change(
            state,
            state,
            _op("reorder_day", {"day": 2, "activity_ids": ["bbbbbbbb"]}),
        )
        self.assertEqual(kind, "reorder")
        self.assertEqual(day, 2)


if __name__ == "__main__":
    unittest.main()
