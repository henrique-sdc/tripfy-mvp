"""
Acesso a `place_reviews` no Firestore (comunidade Tripfy).

1 review por (place_id, uid) — doc id `{place_id}_{uid}` (upsert no POST).
Escrita só via Admin SDK; o client SDK é bloqueado nas rules.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from firebase_admin import firestore
from loguru import logger
from starlette.concurrency import run_in_threadpool

from core.firebase import db
from models.review import PlaceReviewResponse

_COLLECTION = "place_reviews"


def review_doc_id(place_id: str, uid: str) -> str:
    """ID determinístico — garante no máximo um review por usuário/lugar."""
    return f"{place_id}_{uid}"


def _snapshot_to_review(doc_id: str, data: dict[str, Any]) -> PlaceReviewResponse:
    return PlaceReviewResponse(
        id=doc_id,
        place_id=str(data["place_id"]),
        user_uid=str(data["user_uid"]),
        rating=int(data["rating"]),
        comment=str(data["comment"]),
        place_name=str(data.get("place_name") or ""),
        created_at=data["created_at"],
        updated_at=data.get("updated_at"),
    )


async def list_by_place(place_id: str, limit: int = 20) -> list[PlaceReviewResponse]:
    """Lista reviews do lugar; ordena em memória (evita índice composto no MVP)."""

    def _fetch() -> list[PlaceReviewResponse]:
        # Equality só em place_id — sem order_by no Firestore = sem composite index.
        snaps = (
            db.collection(_COLLECTION)
            .where("place_id", "==", place_id)
            .limit(min(limit, 50))
            .stream()
        )
        items: list[PlaceReviewResponse] = []
        for snap in snaps:
            raw = snap.to_dict() or {}
            if "created_at" not in raw:
                continue
            items.append(_snapshot_to_review(snap.id, raw))

        def _sort_key(r: PlaceReviewResponse) -> datetime:
            return r.created_at

        items.sort(key=_sort_key, reverse=True)
        return items[:limit]

    return await run_in_threadpool(_fetch)


async def list_by_user(uid: str, limit: int = 50) -> list[PlaceReviewResponse]:
    """Todas as reviews do usuário (Minhas Avaliações)."""

    def _fetch() -> list[PlaceReviewResponse]:
        snaps = (
            db.collection(_COLLECTION)
            .where("user_uid", "==", uid)
            .limit(min(limit, 100))
            .stream()
        )
        items: list[PlaceReviewResponse] = []
        for snap in snaps:
            raw = snap.to_dict() or {}
            if "created_at" not in raw:
                continue
            items.append(_snapshot_to_review(snap.id, raw))

        def _sort_key(r: PlaceReviewResponse) -> datetime:
            return r.updated_at or r.created_at

        items.sort(key=_sort_key, reverse=True)
        return items[:limit]

    return await run_in_threadpool(_fetch)


async def get_by_place_and_user(
    place_id: str, uid: str
) -> PlaceReviewResponse | None:
    """Busca o review do usuário neste lugar (se existir)."""

    def _fetch() -> PlaceReviewResponse | None:
        snap = (
            db.collection(_COLLECTION)
            .document(review_doc_id(place_id, uid))
            .get()
        )
        if not snap.exists:
            return None
        raw = snap.to_dict() or {}
        return _snapshot_to_review(snap.id, raw)

    return await run_in_threadpool(_fetch)


async def upsert(
    place_id: str,
    uid: str,
    rating: int,
    comment: str,
    place_name: str = "",
) -> PlaceReviewResponse:
    """Cria ou atualiza o review do uid neste place_id."""
    doc_id = review_doc_id(place_id, uid)

    def _write() -> PlaceReviewResponse:
        ref = db.collection(_COLLECTION).document(doc_id)
        existing = ref.get()
        now = firestore.SERVER_TIMESTAMP
        if existing.exists:
            patch: dict[str, Any] = {
                "rating": rating,
                "comment": comment,
                "updated_at": now,
            }
            # Só grava nome se veio preenchido (não apaga o antigo sem querer).
            if place_name:
                patch["place_name"] = place_name
            ref.update(patch)
            logger.info(
                "Review atualizado: place_id={} uid={}",
                place_id[:40],
                uid,
            )
        else:
            ref.set(
                {
                    "place_id": place_id,
                    "user_uid": uid,
                    "rating": rating,
                    "comment": comment,
                    "place_name": place_name,
                    "created_at": now,
                    "updated_at": None,
                }
            )
            logger.info(
                "Review criado: place_id={} uid={}",
                place_id[:40],
                uid,
            )

        snap = ref.get()
        raw = snap.to_dict() or {}
        return _snapshot_to_review(snap.id, raw)

    return await run_in_threadpool(_write)


async def delete_own(place_id: str, uid: str) -> bool:
    """Remove o review do usuário; retorna False se não existia."""
    doc_id = review_doc_id(place_id, uid)

    def _delete() -> bool:
        ref = db.collection(_COLLECTION).document(doc_id)
        snap = ref.get()
        if not snap.exists:
            return False
        ref.delete()
        logger.info(
            "Review removido: place_id={} uid={}",
            place_id[:40],
            uid,
        )
        return True

    return await run_in_threadpool(_delete)
