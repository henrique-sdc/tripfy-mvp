"""Quem entra numa sala Solo — teto de 2, sem Firestore."""
import unittest

from services.trip_invite import decide_join, destination_key, invite_doc_id


class DecideJoinTest(unittest.TestCase):
    def test_solo_sem_lista_abre_vaga(self) -> None:
        code, roster = decide_join([], "owner", "guest")
        self.assertEqual(code, "join")
        self.assertEqual(roster, ["owner", "guest"])

    def test_dono_nao_vira_membro_de_si(self) -> None:
        code, roster = decide_join(["owner"], "owner", "owner")
        self.assertEqual(code, "owner")
        self.assertEqual(roster, ["owner"])

    def test_quem_ja_esta_nao_duplica(self) -> None:
        code, roster = decide_join(["owner", "guest"], "owner", "guest")
        self.assertEqual(code, "already")
        self.assertEqual(roster, ["owner", "guest"])

    def test_sala_cheia_recusa_o_terceiro(self) -> None:
        code, roster = decide_join(["owner", "guest"], "owner", "other")
        self.assertEqual(code, "full")
        self.assertEqual(roster, ["owner", "guest"])

    def test_uid_repetido_nao_enche_a_sala(self) -> None:
        code, roster = decide_join(["owner", "owner"], "owner", "guest")
        self.assertEqual(code, "join")
        self.assertEqual(roster, ["owner", "guest"])

    def test_dono_ausente_da_lista_entra_antes_do_teto(self) -> None:
        code, roster = decide_join(["guest"], "owner", "other")
        self.assertEqual(code, "full")
        self.assertEqual(roster, ["owner", "guest"])


class InviteHelpersTest(unittest.TestCase):
    def test_hash_nao_devolve_o_token(self) -> None:
        token = "abcDEF1234567890_token-ok"
        digest = invite_doc_id(token)
        self.assertEqual(len(digest), 64)
        self.assertNotIn(token, digest)
        self.assertEqual(digest, invite_doc_id(f"  {token}  "))

    def test_destino_colapsa_espaco_e_caixa(self) -> None:
        self.assertEqual(destination_key("  Lisboa,  Portugal "), "lisboa, portugal")
