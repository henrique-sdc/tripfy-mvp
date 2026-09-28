"""Convite de edição numa viagem Solo. Puro — a transação só aplica o resultado.

O link de leitura já carrega o id da viagem. O token é outro segredo: quem
tem o link público não vira editor. O hash (sha256) é o id do doc; o
plaintext não fica gravado.
"""

from __future__ import annotations

import hashlib
import re

# Dono + 1. 3+ continua Premium futuro (mesmo teto do Match grátis).
MAX_COLLAB_MEMBERS = 2
_TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{20,200}$")


def valid_invite_token(token: str) -> bool:
    return bool(_TOKEN_RE.fullmatch(token.strip()))


def invite_doc_id(token: str) -> str:
    """Id do doc em trip_invites. Não é reversível."""
    return hashlib.sha256(token.strip().encode("utf-8")).hexdigest()


def destination_key(value: str) -> str:
    """Igualdade do feed. Prefixo ('lis' → Lisboa) não entra aqui."""
    return " ".join(value.strip().casefold().split())


def normalize_members(members: list[str], owner: str) -> list[str]:
    cleaned: list[str] = []
    for uid in members:
        if isinstance(uid, str) and uid and uid not in cleaned:
            cleaned.append(uid)
    if owner and owner not in cleaned:
        cleaned.insert(0, owner)
    return cleaned


def decide_join(
    members: list[str],
    owner: str,
    guest: str,
) -> tuple[str, list[str]]:
    """(code, roster). code: owner | already | join | full."""
    roster = normalize_members(members, owner)
    if not guest or guest == owner:
        return "owner", roster
    if guest in roster:
        return "already", roster
    if len(roster) >= MAX_COLLAB_MEMBERS:
        return "full", roster
    return "join", [*roster, guest]
