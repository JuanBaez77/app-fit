"""Los endpoints de análisis, con el cliente de Claude simulado: no llaman a la API."""

from datetime import date, timedelta
from typing import Any

import anthropic
import httpx2
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.brain.client import Completion
from app.config import get_settings
from app.main import app
from app.models import AppUser
from app.security import create_access_token
from tests.factories import make_user
from tests.fakes import TODAY, FakeClaude, analyze, answer, change, use


def test_pedir_y_leer_un_analisis(ready: TestClient, auth: dict[str, str]) -> None:
    use(
        FakeClaude(
            answer(change("set_sets", {"routine_day_exercise_id": "rde-1", "from": 3, "to": 4}))
        )
    )

    response = analyze(ready, auth, window="4w")

    assert response.status_code == 201, response.text
    created = response.json()
    assert created["status"] == "ok"
    assert created["window_to"] == (TODAY - timedelta(days=1)).isoformat()
    assert created["window_from"] == (TODAY - timedelta(days=28)).isoformat()
    assert created["metrics"]["routine"]["version"] == 1
    assert created["response"]["summary"] == "Vas bien."
    [only] = created["changes"]
    assert only["status"] == "pendiente"
    assert only["target"]["to"] == 4
    assert only["evidence_links"] == ["volumen"]

    read = ready.get(f"/analyses/{created['id']}", headers=auth).json()
    assert read == created
    listed = ready.get("/analyses", headers=auth).json()
    assert [a["id"] for a in listed] == [created["id"]]
    assert "metrics" not in listed[0]


def test_ventanas(ready: TestClient, auth: dict[str, str]) -> None:
    use(FakeClaude(answer()))

    week = analyze(ready, auth, window="1w").json()
    version = analyze(ready, auth, window="version").json()

    assert week["window_from"] == (TODAY - timedelta(days=7)).isoformat()
    # La v1 rige desde el inicio de la rutina importada
    assert version["window_from"] == "2026-10-20"
    assert version["metrics"]["window"]["label"] == "desde la versión 1 de la rutina"


def test_si_la_api_de_claude_falla_queda_registrado(
    ready: TestClient, auth: dict[str, str]
) -> None:
    def broken(request: dict[str, Any]) -> Completion:
        raise anthropic.APIConnectionError(
            request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
        )

    use(broken)

    response = analyze(ready, auth)

    assert response.status_code == 201
    assert response.json()["status"] == "fallido"
    assert "no respondió" in response.json()["error"]
    assert response.json()["changes"] == []


def test_sin_bundle_avisa(client: TestClient, auth: dict[str, str]) -> None:
    client.post("/routines/import", headers=auth)
    use(FakeClaude(answer()))

    response = analyze(client, auth)

    assert response.status_code == 409
    assert "bundle" in response.json()["detail"]


def test_sin_rutina_avisa(client: TestClient, auth: dict[str, str]) -> None:
    use(FakeClaude(answer()))

    assert analyze(client, auth).status_code == 409


def test_la_fecha_del_celular_tiene_que_ser_hoy(ready: TestClient, auth: dict[str, str]) -> None:
    use(FakeClaude(answer()))

    response = ready.post(
        "/analyses", headers=auth, json={"today": (TODAY - timedelta(days=5)).isoformat()}
    )

    assert response.status_code == 422


def test_el_analisis_de_otro_usuario_no_existe(
    ready: TestClient, auth: dict[str, str], db: Session
) -> None:
    use(FakeClaude(answer()))
    created = analyze(ready, auth).json()
    stranger: AppUser = make_user(db)
    other = {"Authorization": f"Bearer {create_access_token(stranger.id, get_settings())}"}

    assert ready.get(f"/analyses/{created['id']}", headers=other).status_code == 404
    assert ready.get("/analyses", headers=other).json() == []


def test_sin_sesion(client: TestClient) -> None:
    response = client.post("/analyses", json={"today": date.today().isoformat()})

    assert response.status_code == 401


def test_sin_api_key_avisa_antes_de_llamar(ready: TestClient, auth: dict[str, str]) -> None:
    app.dependency_overrides[get_settings] = lambda: get_settings().model_copy(
        update={"anthropic_api_key": None}
    )

    response = analyze(ready, auth)

    assert response.status_code == 503
    assert "ANTHROPIC_API_KEY" in response.json()["detail"]
