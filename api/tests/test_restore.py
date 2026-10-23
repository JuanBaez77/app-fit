"""Volver a una versión anterior (US-19): crea otra con su contenido y no borra historia."""

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AppUser, Exercise
from app.security import create_access_token
from tests.factories import make_user
from tests.fakes import FakeClaude, analyze, answer, change, use

Headers = dict[str, str]


def current(client: TestClient, auth: Headers) -> dict[str, Any]:
    routine: dict[str, Any] = client.get("/routines/current", headers=auth).json()
    return routine


def edit_first_sets(client: TestClient, auth: Headers, sets: int) -> dict[str, Any]:
    """Una versión nueva con otras series en el primer ejercicio del primer día."""
    routine = current(client, auth)
    day = routine["days"][0]
    items = [
        {
            "routine_day_exercise_id": e["id"],
            **{k: e[k] for k in ("exercise_id", "reps_min", "reps_max", "rir_min", "rir_max")},
            "target_sets": sets if i == 0 else e["target_sets"],
        }
        for i, e in enumerate(day["exercises"])
    ]
    response = client.post(
        f"/routines/{routine['id']}/versions",
        headers=auth,
        json={"days": [{"routine_day_id": day["id"], "exercises": items}]},
    )
    created: dict[str, Any] = response.json()
    return created


def content(routine: dict[str, Any]) -> list[list[dict[str, Any]]]:
    """Los ejercicios de cada día sin sus ids."""
    return [
        [{k: v for k, v in e.items() if k != "id"} for e in day["exercises"]]
        for day in routine["days"]
    ]


def restore(client: TestClient, auth: Headers, routine_id: str) -> Any:
    return client.post(f"/routines/{routine_id}/restore", headers=auth)


def test_volver_a_una_version_crea_otra_y_deja_la_historia(
    ready: TestClient, auth: Headers
) -> None:
    v1 = current(ready, auth)
    edit_first_sets(ready, auth, 5)

    response = restore(ready, auth, v1["id"])

    assert response.status_code == 201, response.text
    v3 = response.json()
    assert (v3["version"], v3["status"], v3["source"]) == (3, "vigente", "manual")
    assert v3["days"][0]["exercises"][0]["target_sets"] == 3
    # El mismo contenido que la v1, con filas nuevas
    assert content(v3) == content(v1)
    assert v3["days"][0]["exercises"][0]["id"] != v1["days"][0]["exercises"][0]["id"]
    assert v3["muscle_targets"] == v1["muscle_targets"]
    versions = ready.get("/routines", headers=auth).json()
    assert [(v["version"], v["status"]) for v in versions] == [
        (3, "vigente"),
        (2, "historica"),
        (1, "historica"),
    ]


def test_un_cambio_pendiente_de_la_version_restaurada_se_encuentra(
    ready: TestClient, auth: Headers
) -> None:
    v1 = current(ready, auth)
    use(
        FakeClaude(
            answer(change("set_sets", {"routine_day_exercise_id": "rde-1", "from": 3, "to": 4}))
        )
    )
    analysis = analyze(ready, auth).json()
    edit_first_sets(ready, auth, 5)
    restore(ready, auth, v1["id"])

    change_id = analysis["changes"][0]["id"]
    response = ready.post(f"/analyses/{analysis['id']}/changes/{change_id}/accept", headers=auth)

    # La v3 desciende de la v1: el cambio se encuentra y el from vuelve a coincidir
    assert response.json()["change"]["status"] == "aceptado"
    assert response.json()["routine"]["days"][0]["exercises"][0]["target_sets"] == 4


def test_la_vigente_no_se_restaura(ready: TestClient, auth: Headers) -> None:
    response = restore(ready, auth, current(ready, auth)["id"])

    assert response.status_code == 409
    assert response.json()["detail"] == "Esa ya es la versión vigente"


def test_si_un_ejercicio_ya_no_esta_en_el_catalogo_avisa(
    ready: TestClient, auth: Headers, db: Session
) -> None:
    v1 = current(ready, auth)
    edit_first_sets(ready, auth, 5)
    exercise = db.get(Exercise, v1["days"][0]["exercises"][1]["exercise_id"])
    assert exercise is not None
    exercise.deleted_at = exercise.updated_at
    db.flush()

    response = restore(ready, auth, v1["id"])

    assert response.status_code == 422
    assert exercise.name in response.json()["detail"]
    assert current(ready, auth)["version"] == 2


def test_la_version_de_otro_usuario_no_existe(
    ready: TestClient, auth: Headers, db: Session
) -> None:
    v1 = current(ready, auth)
    stranger: AppUser = make_user(db)
    other = {"Authorization": f"Bearer {create_access_token(stranger.id, get_settings())}"}

    assert restore(ready, other, v1["id"]).status_code == 404
