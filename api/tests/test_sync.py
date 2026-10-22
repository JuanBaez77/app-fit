import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.cli import create_user
from app.config import get_settings
from app.models import SetLog
from app.security import create_access_token

T0 = datetime(2026, 10, 22, 18, 0, tzinfo=UTC)
Headers = dict[str, str]


def session_row(row_id: str | None = None, updated: datetime = T0, **extra: Any) -> dict[str, Any]:
    return {
        "id": row_id or str(uuid.uuid4()),
        "date": "2026-10-22",
        "started_at": T0.isoformat(),
        "updated_at": updated.isoformat(),
        **extra,
    }


def set_row(
    session_id: str,
    exercise_id: str,
    row_id: str | None = None,
    updated: datetime = T0,
    **extra: Any,
) -> dict[str, Any]:
    return {
        "id": row_id or str(uuid.uuid4()),
        "session_id": session_id,
        "exercise_id": exercise_id,
        "set_number": 1,
        "weight_kg": 80,
        "reps": 8,
        "rir": 2,
        "logged_at": updated.isoformat(),
        "updated_at": updated.isoformat(),
        **extra,
    }


def push(client: TestClient, auth: Headers, **tables: list[dict[str, Any]]) -> dict[str, Any]:
    response = client.post("/sync/push", headers=auth, json=tables)
    assert response.status_code == 200, response.text
    result: dict[str, Any] = response.json()
    return result


def pull(client: TestClient, auth: Headers, since: datetime | None = None) -> dict[str, Any]:
    params = {"since": since.isoformat()} if since else {}
    response = client.get("/sync/pull", headers=auth, params=params)
    assert response.status_code == 200, response.text
    result: dict[str, Any] = response.json()
    return result


@pytest.fixture
def exercise_id(client: TestClient, auth: Headers) -> str:
    """Importa la rutina y devuelve el id del press de banca."""
    client.post("/routines/import", headers=auth)
    exercises = pull(client, auth)["exercises"]
    return str(next(e["id"] for e in exercises if e["name"] == "Press de banca con barra"))


def other_user_auth(db: Session) -> Headers:
    other = create_user(db, "otro@example.com", "otra-contraseña-larga")
    return {"Authorization": f"Bearer {create_access_token(other.id, get_settings())}"}


def test_push_y_pull(client: TestClient, auth: Headers, exercise_id: str) -> None:
    session = session_row()
    sets = [set_row(session["id"], exercise_id, set_number=n) for n in (1, 2)]

    result = push(client, auth, sessions=[session], set_logs=sets)

    assert result == {"applied": 3, "skipped": 0, "rejected": []}
    data = pull(client, auth)
    assert [s["id"] for s in data["sessions"]] == [session["id"]]
    assert sorted(s["set_number"] for s in data["set_logs"]) == [1, 2]
    assert data["set_logs"][0]["weight_kg"] == 80.0


def test_repetir_un_push_no_duplica(
    client: TestClient, auth: Headers, exercise_id: str, db: Session
) -> None:
    session = session_row()
    batch = {"sessions": [session], "set_logs": [set_row(session["id"], exercise_id)]}
    push(client, auth, **batch)

    again = push(client, auth, **batch)

    assert again == {"applied": 0, "skipped": 2, "rejected": []}
    assert db.scalar(select(func.count()).select_from(SetLog)) == 1


def test_gana_el_cambio_mas_nuevo(client: TestClient, auth: Headers, exercise_id: str) -> None:
    session = session_row()
    set_id = str(uuid.uuid4())
    push(client, auth, sessions=[session], set_logs=[set_row(session["id"], exercise_id, set_id)])

    older = set_row(session["id"], exercise_id, set_id, T0 - timedelta(hours=1), weight_kg=70)
    assert push(client, auth, set_logs=[older])["skipped"] == 1
    assert pull(client, auth)["set_logs"][0]["weight_kg"] == 80.0

    newer = set_row(session["id"], exercise_id, set_id, T0 + timedelta(hours=1), weight_kg=82.5)
    assert push(client, auth, set_logs=[newer])["applied"] == 1
    assert pull(client, auth)["set_logs"][0]["weight_kg"] == 82.5


def test_el_borrado_logico_viaja(client: TestClient, auth: Headers, exercise_id: str) -> None:
    session = session_row()
    row = set_row(session["id"], exercise_id)
    push(client, auth, sessions=[session], set_logs=[row])

    later = T0 + timedelta(minutes=1)
    deleted = {**row, "updated_at": later.isoformat(), "deleted_at": later.isoformat()}
    push(client, auth, set_logs=[deleted])

    assert pull(client, auth)["set_logs"][0]["deleted_at"] is not None


def test_una_serie_subida_tarde_llega_al_otro_dispositivo(
    client: TestClient, auth: Headers, exercise_id: str
) -> None:
    session = session_row()
    push(client, auth, sessions=[session])
    cursor = datetime.fromisoformat(pull(client, auth)["cursor"])

    # Cargada sin señal hace dos días, recién ahora llega al servidor
    two_days_ago = datetime.now(UTC) - timedelta(days=2)
    late = set_row(session["id"], exercise_id, updated=two_days_ago)
    push(client, auth, set_logs=[late])

    assert [s["id"] for s in pull(client, auth, since=cursor)["set_logs"]] == [late["id"]]


def test_since_filtra_lo_que_no_cambio(client: TestClient, auth: Headers, exercise_id: str) -> None:
    push(client, auth, sessions=[session_row()])

    future = datetime.now(UTC) + timedelta(hours=1)
    data = pull(client, auth, since=future)

    assert data["sessions"] == data["routines"] == data["exercises"] == []
    assert data["profile"] is None


def test_no_se_pueden_pisar_filas_de_otro_usuario(
    client: TestClient, auth: Headers, db: Session
) -> None:
    session = session_row()
    push(client, auth, sessions=[session])
    other = other_user_auth(db)

    result = push(
        client, other, sessions=[{**session, "updated_at": datetime.now(UTC).isoformat()}]
    )

    assert result["rejected"][0]["reason"] == "La fila es de otro usuario"
    assert pull(client, other)["sessions"] == []


def test_series_en_sesion_ajena(
    client: TestClient, auth: Headers, exercise_id: str, db: Session
) -> None:
    session = session_row()
    push(client, auth, sessions=[session])
    other = other_user_auth(db)

    result = push(client, other, set_logs=[set_row(session["id"], exercise_id)])

    assert result["applied"] == 0
    assert "sesión" in result["rejected"][0]["reason"]


def test_un_peso_por_dia_gana_el_mas_nuevo(client: TestClient, auth: Headers) -> None:
    def weight(updated: datetime, kg: float) -> dict[str, Any]:
        return {
            "id": str(uuid.uuid4()),
            "date": "2026-10-22",
            "kg": kg,
            "updated_at": updated.isoformat(),
        }

    first = weight(T0, 73)
    second = weight(T0 + timedelta(hours=1), 72.8)
    stale = weight(T0 - timedelta(hours=1), 74)
    push(client, auth, body_weights=[first])
    push(client, auth, body_weights=[second])
    push(client, auth, body_weights=[stale])

    weights = {w["id"]: w for w in pull(client, auth)["body_weights"]}
    active = [w for w in weights.values() if w["deleted_at"] is None]
    assert [w["kg"] for w in active] == [72.8]
    assert weights[first["id"]]["deleted_at"] is not None
    assert weights[stale["id"]]["deleted_at"] is not None


def test_ejercicio_nuevo_y_cambio_de_musculos(client: TestClient, auth: Headers) -> None:
    exercise = {
        "id": str(uuid.uuid4()),
        "name": "Fondos en paralelas",
        "kind": "multiarticular",
        "updated_at": T0.isoformat(),
        "muscles": [
            {"muscle_id": "pectoral", "factor": 1},
            {"muscle_id": "triceps", "factor": 0.5},
        ],
    }
    push(client, auth, exercises=[exercise])

    changed = {
        **exercise,
        "updated_at": (T0 + timedelta(minutes=5)).isoformat(),
        "muscles": [{"muscle_id": "triceps", "factor": 1}],
    }
    push(client, auth, exercises=[changed])

    saved = next(e for e in pull(client, auth)["exercises"] if e["id"] == exercise["id"])
    assert saved["muscles"] == [{"muscle_id": "triceps", "factor": 1.0}]


def test_ejercicio_con_musculo_desconocido(client: TestClient, auth: Headers) -> None:
    exercise = {
        "id": str(uuid.uuid4()),
        "name": "Algo",
        "updated_at": T0.isoformat(),
        "muscles": [{"muscle_id": "trapecio", "factor": 1}],
    }

    result = push(client, auth, exercises=[exercise])

    assert "trapecio" in result["rejected"][0]["reason"]


def test_factor_invalido(client: TestClient, auth: Headers) -> None:
    exercise = {
        "id": str(uuid.uuid4()),
        "name": "Algo",
        "updated_at": T0.isoformat(),
        "muscles": [{"muscle_id": "pectoral", "factor": 0.7}],
    }

    response = client.post("/sync/push", headers=auth, json={"exercises": [exercise]})

    assert response.status_code == 422


def test_pull_completo(client: TestClient, auth: Headers, exercise_id: str) -> None:
    data = pull(client, auth)

    assert len(data["routines"]) == 1
    assert data["routines"][0]["status"] == "vigente"
    assert len(data["exercises"]) == 20
    assert data["profile"]["weight_step_kg"] == 2.5
    assert len(data["muscles"]) == 12


def test_sync_requiere_login(client: TestClient) -> None:
    assert client.get("/sync/pull").status_code == 401
    assert client.post("/sync/push", json={}).status_code == 401


def test_fechas_sin_zona_horaria_se_rechazan(client: TestClient, auth: Headers) -> None:
    row = session_row(updated_at="2026-10-22T18:00:00")

    response = client.post("/sync/push", headers=auth, json={"sessions": [row]})

    assert response.status_code == 422
