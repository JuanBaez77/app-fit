from datetime import datetime
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AppUser, Routine, RoutineDay, RoutineDayExercise
from app.security import create_access_token
from tests.factories import make_exercise, make_user

Headers = dict[str, str]


def item(row: dict[str, Any], **extra: Any) -> dict[str, Any]:
    """Un ejercicio del día como lo manda el editor, a partir de cómo lo devuelve la API."""
    fields = (
        "exercise_id",
        "target_sets",
        "reps_min",
        "reps_max",
        "rir_min",
        "rir_max",
        "rest_min_sec",
        "rest_max_sec",
        "note",
    )
    return {"routine_day_exercise_id": row["id"], **{f: row[f] for f in fields}, **extra}


def new_item(exercise_id: str, **extra: Any) -> dict[str, Any]:
    return {"exercise_id": exercise_id, "target_sets": 3, "reps_min": 8, "reps_max": 12, **extra}


def imported(client: TestClient, auth: Headers) -> dict[str, Any]:
    routine: dict[str, Any] = client.post("/routines/import", headers=auth).json()
    return routine


def edit(client: TestClient, auth: Headers, routine_id: str, days: list[dict[str, Any]]) -> Any:
    return client.post(f"/routines/{routine_id}/versions", headers=auth, json={"days": days})


def test_editar_crea_la_v2_y_la_v1_sigue_consultable(
    client: TestClient, auth: Headers, user: AppUser, db: Session
) -> None:
    v1 = imported(client, auth)
    day = v1["days"][0]
    first, second, *rest = day["exercises"]
    curl = make_exercise(db, user, "Curl en banco Scott", {"biceps": "1.0"})

    response = edit(
        client,
        auth,
        v1["id"],
        [
            {
                "routine_day_id": day["id"],
                # El segundo sube al primer lugar, el primero cambia las series, se agrega uno
                # nuevo y se quitan los demás
                "exercises": [
                    item(second),
                    item(first, target_sets=first["target_sets"] + 1),
                    new_item(str(curl.id), rir_min=1, rir_max=2),
                ],
            }
        ],
    )

    assert response.status_code == 201, response.text
    v2 = response.json()
    assert (v2["version"], v2["status"], v2["source"]) == (2, "vigente", "manual")
    assert v2["parent_routine_id"] == v1["id"]
    assert v2["start_on"] == v1["start_on"]
    edited = v2["days"][0]["exercises"]
    assert [e["exercise_id"] for e in edited] == [
        second["exercise_id"],
        first["exercise_id"],
        str(curl.id),
    ]
    assert [e["position"] for e in edited] == [1, 2, 3]
    assert edited[1]["target_sets"] == first["target_sets"] + 1
    # Los otros días se copian tal cual
    assert [len(d["exercises"]) for d in v2["days"][1:]] == [
        len(d["exercises"]) for d in v1["days"][1:]
    ]
    assert len(rest) > 0

    # La v1 sigue consultable, sin cambios, y nunca hay dos vigentes
    old = client.get(f"/routines/{v1['id']}", headers=auth).json()
    assert old["status"] == "historica"
    assert old["days"] == v1["days"]
    assert [r["version"] for r in client.get("/routines", headers=auth).json()] == [2, 1]
    vigentes = db.scalar(
        select(func.count()).where(Routine.user_id == user.id, Routine.status == "vigente")
    )
    assert vigentes == 1
    assert client.get("/routines/current", headers=auth).json()["id"] == v2["id"]


def test_las_copias_guardan_el_linaje(client: TestClient, auth: Headers, db: Session) -> None:
    v1 = imported(client, auth)
    day = v1["days"][0]
    v2 = edit(
        client,
        auth,
        v1["id"],
        [{"routine_day_id": day["id"], "exercises": [item(e) for e in day["exercises"]]}],
    ).json()

    new_day = db.get(RoutineDay, v2["days"][0]["id"])
    assert new_day is not None
    assert str(new_day.cloned_from_id) == day["id"]
    copies = db.scalars(
        select(RoutineDayExercise).where(RoutineDayExercise.routine_day_id == new_day.id)
    )
    assert sorted(str(c.cloned_from_id) for c in copies) == sorted(
        e["id"] for e in day["exercises"]
    )


def test_el_pull_trae_las_dos_versiones(client: TestClient, auth: Headers) -> None:
    v1 = imported(client, auth)
    cursor = datetime.fromisoformat(client.get("/sync/pull", headers=auth).json()["cursor"])
    day = v1["days"][0]
    edit(
        client,
        auth,
        v1["id"],
        [{"routine_day_id": day["id"], "exercises": [item(day["exercises"][0])]}],
    )

    pulled = client.get("/sync/pull", headers=auth, params={"since": cursor.isoformat()}).json()

    assert sorted((r["version"], r["status"]) for r in pulled["routines"]) == [
        (1, "historica"),
        (2, "vigente"),
    ]


def test_editar_una_version_vieja_es_conflicto(client: TestClient, auth: Headers) -> None:
    v1 = imported(client, auth)
    day = v1["days"][0]
    body = [{"routine_day_id": day["id"], "exercises": [item(day["exercises"][0])]}]
    assert edit(client, auth, v1["id"], body).status_code == 201

    response = edit(client, auth, v1["id"], body)

    assert response.status_code == 409
    assert len(client.get("/routines", headers=auth).json()) == 2


def test_un_ejercicio_sin_musculos_no_se_puede_usar(
    client: TestClient, auth: Headers, user: AppUser, db: Session
) -> None:
    v1 = imported(client, auth)
    day = v1["days"][0]
    # Solo indirecta: no tiene un músculo directo con el que contar el volumen
    partial = make_exercise(db, user, "Fondos", {"triceps": "0.5"})
    other_user = make_exercise(db, make_user(db), "Ajeno", {"pectoral": "1.0"})

    for exercise in (partial, other_user):
        response = edit(
            client,
            auth,
            v1["id"],
            [{"routine_day_id": day["id"], "exercises": [new_item(str(exercise.id))]}],
        )
        assert response.status_code == 422, exercise.name
        assert "músculos" in response.json()["detail"]
    assert len(client.get("/routines", headers=auth).json()) == 1


def test_ids_de_otro_dia_o_repetidos(client: TestClient, auth: Headers) -> None:
    v1 = imported(client, auth)
    first_day, second_day = v1["days"][0], v1["days"][1]
    own = item(first_day["exercises"][0])

    for exercises in (
        [own, item(second_day["exercises"][0])],
        [own, own],
    ):
        response = edit(
            client, auth, v1["id"], [{"routine_day_id": first_day["id"], "exercises": exercises}]
        )
        assert response.status_code == 422, response.text


def test_valida_los_rangos(client: TestClient, auth: Headers) -> None:
    v1 = imported(client, auth)
    day = v1["days"][0]
    row = day["exercises"][0]

    for bad in (
        {"reps_min": 12, "reps_max": 8},
        {"rir_min": 1, "rir_max": None},
        {"target_sets": 0},
    ):
        response = edit(
            client, auth, v1["id"], [{"routine_day_id": day["id"], "exercises": [item(row, **bad)]}]
        )
        assert response.status_code == 422, bad


def test_la_rutina_de_otro_usuario_no_existe(
    client: TestClient, auth: Headers, db: Session
) -> None:
    v1 = imported(client, auth)
    stranger = make_user(db)
    other = {"Authorization": f"Bearer {create_access_token(stranger.id, get_settings())}"}

    assert client.get(f"/routines/{v1['id']}", headers=other).status_code == 404
    day = v1["days"][0]
    body = [{"routine_day_id": day["id"], "exercises": [item(day["exercises"][0])]}]
    assert edit(client, other, v1["id"], body).status_code == 404
