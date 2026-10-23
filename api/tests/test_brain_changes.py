"""Aceptar y rechazar los cambios del brain (US-18), con Claude simulado."""

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AppUser, Exercise, Routine
from app.security import create_access_token
from app.services.brain_changes import EN_DASH
from tests.factories import make_user
from tests.fakes import FakeClaude, analyze, answer, change, use

Headers = dict[str, str]


def analysis_with(client: TestClient, auth: Headers, *changes: dict[str, Any]) -> dict[str, Any]:
    use(FakeClaude(answer(*changes)))
    created: dict[str, Any] = analyze(client, auth).json()
    assert created["status"] == "ok"
    assert created["discarded"] is None, created["discarded"]
    return created


def decide(
    client: TestClient, auth: Headers, analysis: dict[str, Any], index: int, verb: str
) -> Any:
    change_id = analysis["changes"][index]["id"]
    return client.post(f"/analyses/{analysis['id']}/changes/{change_id}/{verb}", headers=auth)


def current(client: TestClient, auth: Headers) -> dict[str, Any]:
    routine: dict[str, Any] = client.get("/routines/current", headers=auth).json()
    return routine


def torso(routine: dict[str, Any]) -> list[dict[str, Any]]:
    exercises: list[dict[str, Any]] = routine["days"][0]["exercises"]
    return exercises


SETS = change("set_sets", {"routine_day_exercise_id": "rde-1", "from": 3, "to": 4})
REPS = change("set_rep_range", {"routine_day_exercise_id": "rde-2", "from": [8, 12], "to": [6, 10]})


def test_aceptar_dos_cambios_de_a_uno_da_la_v2_y_la_v3(
    ready: TestClient, auth: Headers, db: Session
) -> None:
    analysis = analysis_with(ready, auth, SETS, REPS)

    first = decide(ready, auth, analysis, 0, "accept")
    second = decide(ready, auth, analysis, 1, "accept")

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    v2, v3 = first.json()["routine"], second.json()["routine"]
    assert (v2["version"], v3["version"]) == (2, 3)
    assert v2["source"] == v3["source"] == "brain"
    # La v3 tiene los dos: el segundo cambio se encontró en la v2 por el linaje
    banca, remo, *_ = torso(v3)
    assert banca["target_sets"] == 4
    assert (remo["reps_min"], remo["reps_max"]) == (6, 10)
    assert torso(v2)[1]["reps_min"] == 8

    assert first.json()["change"]["status"] == "aceptado"
    assert first.json()["change"]["applied_routine_id"] == v2["id"]
    assert second.json()["change"]["applied_routine_id"] == v3["id"]
    saved = db.get(Routine, v3["id"])
    assert saved is not None and str(saved.from_analysis_id) == analysis["id"]
    # Nada se perdió: las tres versiones siguen, y una sola vigente
    versions = ready.get("/routines", headers=auth).json()
    assert [(v["version"], v["status"]) for v in versions] == [
        (3, "vigente"),
        (2, "historica"),
        (1, "historica"),
    ]
    read = ready.get(f"/analyses/{analysis['id']}", headers=auth).json()
    assert [c["status"] for c in read["changes"]] == ["aceptado", "aceptado"]


def test_si_from_ya_no_coincide_queda_obsoleto(ready: TestClient, auth: Headers) -> None:
    analysis = analysis_with(ready, auth, SETS, REPS)
    # Después del análisis, las series del primero y las repeticiones del segundo se editaron
    v1 = current(ready, auth)
    items = [
        {
            "routine_day_exercise_id": e["id"],
            **{k: e[k] for k in ("exercise_id", "reps_min", "reps_max", "rir_min", "rir_max")},
            "target_sets": 5 if i == 0 else e["target_sets"],
        }
        | ({"reps_min": 10, "reps_max": 14} if i == 1 else {})
        for i, e in enumerate(torso(v1))
    ]
    edited = ready.post(
        f"/routines/{v1['id']}/versions",
        headers=auth,
        json={"days": [{"routine_day_id": v1["days"][0]["id"], "exercises": items}]},
    )
    assert edited.status_code == 201

    response = decide(ready, auth, analysis, 0, "accept")

    assert response.status_code == 200
    assert response.json()["change"]["status"] == "obsoleto"
    assert response.json()["routine"] is None
    assert response.json()["reason"] == (
        "Series de Press de banca con barra: al analizar era 3 y ahora es 5"
    )
    reps = decide(ready, auth, analysis, 1, "accept").json()
    assert reps["reason"].endswith(f"al analizar era 8{EN_DASH}12 y ahora es 10{EN_DASH}14")
    assert current(ready, auth)["version"] == 2


def test_si_el_ejercicio_ya_no_esta_queda_obsoleto(ready: TestClient, auth: Headers) -> None:
    analysis = analysis_with(ready, auth, SETS)
    v1 = current(ready, auth)
    # Se quitó el primero del día
    items = [
        {k: e[k] for k in ("exercise_id", "target_sets", "reps_min", "reps_max")}
        | {"routine_day_exercise_id": e["id"]}
        for e in torso(v1)[1:]
    ]
    ready.post(
        f"/routines/{v1['id']}/versions",
        headers=auth,
        json={"days": [{"routine_day_id": v1["days"][0]["id"], "exercises": items}]},
    )

    response = decide(ready, auth, analysis, 0, "accept")

    assert response.json()["change"]["status"] == "obsoleto"
    assert response.json()["reason"] == "El ejercicio ya no está en la rutina"


def test_rechazar_no_toca_la_rutina_y_no_se_decide_dos_veces(
    ready: TestClient, auth: Headers
) -> None:
    analysis = analysis_with(ready, auth, SETS)

    rejected = decide(ready, auth, analysis, 0, "reject")
    again = decide(ready, auth, analysis, 0, "accept")

    assert rejected.status_code == 200
    assert rejected.json()["change"]["status"] == "rechazado"
    assert rejected.json()["change"]["decided_at"] is not None
    assert again.status_code == 409
    assert again.json()["detail"] == "El cambio ya está rechazado"
    assert current(ready, auth)["version"] == 1


def test_el_cambio_de_otro_usuario_no_existe(ready: TestClient, auth: Headers, db: Session) -> None:
    analysis = analysis_with(ready, auth, SETS)
    stranger: AppUser = make_user(db)
    other = {"Authorization": f"Bearer {create_access_token(stranger.id, get_settings())}"}

    assert decide(ready, other, analysis, 0, "accept").status_code == 404
    assert decide(ready, other, analysis, 0, "reject").status_code == 404


def test_cada_tipo_de_cambio_se_aplica(ready: TestClient, auth: Headers, db: Session) -> None:
    new_exercise = {
        "name": "Press en máquina",
        "kind": "multiarticular",
        "muscles": [
            {"muscle_id": "pectoral", "factor": 1},
            {"muscle_id": "triceps", "factor": 0.5},
        ],
    }
    analysis = analysis_with(
        ready,
        auth,
        change("set_rir", {"routine_day_exercise_id": "rde-1", "from": [1, 2], "to": [0, 1]}),
        change(
            "set_rest", {"routine_day_exercise_id": "rde-1", "from": [120, 180], "to": [150, 180]}
        ),
        change("swap_exercise", {"routine_day_exercise_id": "rde-2", "new_exercise": new_exercise}),
        change("remove_exercise", {"routine_day_exercise_id": "rde-7"}),
        change(
            "add_exercise",
            {
                "routine_day_id": "d2",
                "exercise_id": "ex-press-banca-barra",
                "position": 1,
                "sets": 2,
                "reps": [8, 10],
                "rir": [1, 2],
                "rest_s": None,
            },
        ),
    )
    triceps = change(
        "set_muscle_target", {"muscle_id": "triceps", "from": 6, "to": 8, "range": [6, 9]}
    )
    second = analysis_with(ready, auth, triceps)

    for index in range(5):
        response = decide(ready, auth, analysis, index, "accept")
        assert response.json()["change"]["status"] == "aceptado", response.text
    assert decide(ready, auth, second, 0, "accept").status_code == 200

    routine = current(ready, auth)
    assert routine["version"] == 7
    banca, swapped = torso(routine)[:2]
    assert (banca["rir_min"], banca["rir_max"]) == (0, 1)
    assert (banca["rest_min_sec"], banca["rest_max_sec"]) == (150, 180)
    created = db.scalar(select(Exercise).where(Exercise.name == "Press en máquina"))
    assert created is not None
    # El reemplazo conserva series y rangos
    assert swapped["exercise_id"] == str(created.id)
    assert (swapped["target_sets"], swapped["reps_min"]) == (3, 8)
    # El séptimo (curl) se fue
    assert len(torso(routine)) == 6
    assert [e["position"] for e in torso(routine)] == [1, 2, 3, 4, 5, 6]
    pierna = routine["days"][1]["exercises"]
    assert pierna[0]["target_sets"] == 2
    assert [e["position"] for e in pierna] == list(range(1, len(pierna) + 1))
    target = next(t for t in routine["muscle_targets"] if t["muscle_id"] == "triceps")
    # Las directas suben 2 y el objetivo fraccional se corre lo mismo
    assert (target["target_sets"], target["fractional_target"]) == (8, 12.5)
    assert (target["range_min"], target["range_max"]) == (6, 9)
