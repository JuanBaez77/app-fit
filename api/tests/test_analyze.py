"""El análisis de punta a punta con el cliente simulado: no llama a la API ni gasta."""

from datetime import UTC, date, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.brain.analyze import AnalysisUnavailable, run_analysis
from app.brain.summary import Window
from app.models import AppUser, BrainBundle, RoutineDay, RoutineDayExercise
from tests.fakes import PAGES, FakeClaude, answer, change

WINDOW = Window(date(2026, 10, 20), date(2026, 11, 16), "desde el inicio de la rutina v1")
TODAY = date(2026, 11, 17)


@pytest.fixture
def ready(client: TestClient, auth: dict[str, str], user: AppUser, db: Session) -> AppUser:
    client.post("/routines/import", headers=auth)
    db.add(
        BrainBundle(
            version="abc1234",
            built_at=datetime(2026, 10, 22, tzinfo=UTC),
            pages_json=PAGES,
            content="<brain/>",
        )
    )
    db.flush()
    return user


def bench(db: Session) -> RoutineDayExercise:
    """rde-1: el primer ejercicio del primer día (press de banca, 3 series de 6 a 10, RIR 1 a 2)."""
    first_day = db.scalar(select(RoutineDay).order_by(RoutineDay.position).limit(1))
    assert first_day is not None
    return first_day.exercises[0]


def test_respuesta_valida(ready: AppUser, db: Session) -> None:
    item = bench(db)
    fake = FakeClaude(
        answer(
            change("set_sets", {"routine_day_exercise_id": "rde-1", "from": 3, "to": 4}),
            change(
                "set_rep_range",
                {"routine_day_exercise_id": "rde-1", "from": [6, 10], "to": [8, 12]},
                basis="practica",
                level=None,
                links=(),
            ),
        )
    )

    analysis = run_analysis(db, ready, WINDOW, TODAY, fake)

    assert analysis.status == "ok"
    assert (analysis.brain_version, analysis.prompt_version) == ("abc1234", "1")
    assert (analysis.input_tokens, analysis.output_tokens, analysis.cache_read_tokens) == (
        1000,
        200,
        900,
    )
    assert analysis.metrics_json["routine"]["days"][0]["exercises"][0]["id"] == "rde-1"
    assert analysis.aliases_json["items"]["rde-1"] == str(item.id)
    # El bundle va como bloque cacheable del system
    assert fake.requests[0]["system"][-1] == {
        "type": "text",
        "text": "<brain/>",
        "cache_control": {"type": "ephemeral"},
    }
    sets, reps = analysis.changes
    assert (sets.status, sets.position, sets.type) == ("pendiente", 1, "set_sets")
    # Los alias quedan traducidos a los ids reales
    assert sets.target_json == {"routine_day_exercise_id": str(item.id), "from": 3, "to": 4}
    assert reps.target_json["to"] == [8, 12]
    # Las citas inventadas de las evaluaciones también se descartan
    assert analysis.response_json is not None
    assert analysis.response_json["exercise_assessments"][0]["evidence_links"] == ["press-de-banca"]


def test_cita_inexistente(ready: AppUser, db: Session) -> None:
    fake = FakeClaude(
        answer(
            change(
                "set_sets",
                {"routine_day_exercise_id": "rde-1", "from": 3, "to": 4},
                level=3,
                links=("pagina-inventada",),
            ),
            change(
                "set_rir",
                {"routine_day_exercise_id": "rde-1", "from": [1, 2], "to": [0, 1]},
                links=("rir", "otra-inventada"),
            ),
        )
    )

    only_fake, mixed = run_analysis(db, ready, WINDOW, TODAY, fake).changes

    # Sin ninguna cita que exista no hay evidencia verificable: queda como práctica
    assert (only_fake.basis, only_fake.evidence_level) == ("practica", None)
    assert only_fake.evidence_links_json == []
    assert only_fake.dropped_links_json == ["pagina-inventada"]
    assert (mixed.basis, mixed.evidence_level) == ("evidencia", 2)
    assert mixed.evidence_links_json == ["rir"]
    assert mixed.dropped_links_json == ["otra-inventada"]


def test_from_desfasado(ready: AppUser, db: Session) -> None:
    fake = FakeClaude(
        answer(
            change("set_sets", {"routine_day_exercise_id": "rde-1", "from": 5, "to": 6}),
            change("remove_exercise", {"routine_day_exercise_id": "rde-999"}),
        )
    )

    analysis = run_analysis(db, ready, WINDOW, TODAY, fake)

    assert analysis.status == "ok"
    assert analysis.changes == []
    assert analysis.discarded_json is not None
    stale, missing = analysis.discarded_json
    assert stale["position"] == 1
    assert "el valor actual es 3" in stale["reason"]
    assert "rde-999" in missing["reason"]


def test_json_roto_dos_veces(ready: AppUser, db: Session) -> None:
    fake = FakeClaude('{"summary": "cortado', "tampoco es json")

    analysis = run_analysis(db, ready, WINDOW, TODAY, fake)

    assert analysis.status == "fallido"
    assert analysis.raw_response == "tampoco es json"
    assert analysis.error is not None and "esquema" in analysis.error
    assert analysis.changes == []
    assert analysis.input_tokens == 2000
    # El reintento lleva la respuesta anterior y el error
    retry = fake.requests[1]["messages"]
    assert retry[1] == {"role": "assistant", "content": '{"summary": "cortado'}
    assert "no sirve" in retry[2]["content"]


def test_un_reintento_alcanza(ready: AppUser, db: Session) -> None:
    fake = FakeClaude("no es json", answer())

    analysis = run_analysis(db, ready, WINDOW, TODAY, fake)

    assert analysis.status == "ok"
    assert len(fake.requests) == 2


def test_un_rechazo_no_se_reintenta(ready: AppUser, db: Session) -> None:
    fake = FakeClaude("", stop_reason="refusal")

    analysis = run_analysis(db, ready, WINDOW, TODAY, fake)

    assert analysis.status == "fallido"
    assert len(fake.requests) == 1


@pytest.mark.parametrize(
    ("bad", "reason"),
    [
        (change("set_sets", {"routine_day_exercise_id": "rde-1", "from": 3, "to": 50}), "50"),
        (
            change("set_rir", {"routine_day_exercise_id": "rde-1", "from": [1, 2], "to": [0, 7]}),
            "fuera de lo posible",
        ),
        (
            change(
                "add_exercise",
                {
                    "routine_day_id": "d1",
                    "new_exercise": {
                        "name": "Fondos",
                        "kind": "multiarticular",
                        "muscles": [{"muscle_id": "triceps", "factor": 0.5}],
                    },
                    "sets": 3,
                    "reps": [8, 12],
                },
            ),
            "músculo directo",
        ),
        (
            change("set_muscle_target", {"muscle_id": "pectoral", "from": 12, "to": 99}),
            "99",
        ),
    ],
)
def test_cordura_de_los_valores(
    ready: AppUser, db: Session, bad: dict[str, Any], reason: str
) -> None:
    analysis = run_analysis(db, ready, WINDOW, TODAY, FakeClaude(answer(bad)))

    assert analysis.changes == []
    assert analysis.discarded_json is not None
    assert reason in analysis.discarded_json[0]["reason"]


def test_agregar_un_ejercicio_del_catalogo(ready: AppUser, db: Session) -> None:
    fake = FakeClaude(
        answer(
            change(
                "add_exercise",
                {
                    "routine_day_id": "d1",
                    "exercise_id": "ex-cruces-polea",
                    "position": 2,
                    "sets": 2,
                    "reps": [12, 15],
                    "rir": [0, 1],
                    "rest_s": [90, 120],
                },
            ),
            change("set_muscle_target", {"muscle_id": "pectoral", "from": 12, "to": 14}),
        )
    )

    added, target = run_analysis(db, ready, WINDOW, TODAY, fake).changes

    first_day = db.scalar(select(RoutineDay).order_by(RoutineDay.position).limit(1))
    assert first_day is not None
    assert added.target_json["routine_day_id"] == str(first_day.id)
    assert added.target_json["exercise_id"] is not None
    assert target.target_json == {"muscle_id": "pectoral", "from": 12.0, "to": 14, "range": None}


def test_sin_bundle_no_se_puede_analizar(
    client: TestClient, auth: dict[str, str], user: AppUser, db: Session
) -> None:
    client.post("/routines/import", headers=auth)

    with pytest.raises(AnalysisUnavailable, match="bundle"):
        run_analysis(db, user, WINDOW, TODAY, FakeClaude(answer()))
