from datetime import datetime
from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import AppUser, UserProfile

Headers = dict[str, str]


def profile_body(**extra: Any) -> dict[str, Any]:
    return {
        "sex": "masculino",
        "birth_year": 1990,
        "height_cm": 175.5,
        "experience_years": 4,
        "habitual_rir": 2,
        "goal": "hipertrofia de torso",
        "priority_muscles": ["pectoral", "deltoides_lateral"],
        "phase": "definicion",
        "phase_start": "2026-10-01",
        "phase_target": "inicios de diciembre de 2026",
        "equipment": "gimnasio completo",
        "limitations": None,
        "weight_step_kg": 1.25,
        "send_discomfort_to_ai": False,
        **extra,
    }


def test_crear_y_reemplazar_el_perfil(
    client: TestClient, auth: Headers, user: AppUser, db: Session
) -> None:
    created = client.put("/me/profile", headers=auth, json=profile_body())
    assert created.status_code == 200, created.text
    assert created.json()["weight_step_kg"] == 1.25

    replaced = client.put(
        "/me/profile",
        headers=auth,
        json=profile_body(weight_step_kg=2, phase="volumen", send_discomfort_to_ai=True),
    )

    assert replaced.status_code == 200, replaced.text
    profile = db.get(UserProfile, user.id)
    assert profile is not None
    assert profile.weight_step_kg == Decimal("2")
    assert profile.height_cm == Decimal("175.5")
    assert profile.phase == "volumen"
    assert profile.send_discomfort_to_ai is True


def test_el_cambio_llega_en_el_proximo_pull(client: TestClient, auth: Headers) -> None:
    client.put("/me/profile", headers=auth, json=profile_body())
    cursor = datetime.fromisoformat(client.get("/sync/pull", headers=auth).json()["cursor"])

    client.put("/me/profile", headers=auth, json=profile_body(weight_step_kg=2.5))
    pulled = client.get("/sync/pull", headers=auth, params={"since": cursor.isoformat()})

    assert pulled.json()["profile"]["weight_step_kg"] == 2.5


def test_rechaza_musculos_desconocidos(client: TestClient, auth: Headers) -> None:
    response = client.put(
        "/me/profile", headers=auth, json=profile_body(priority_muscles=["pectoral", "aductor"])
    )

    assert response.status_code == 422
    assert "aductor" in response.json()["detail"]


def test_todos_los_campos_son_obligatorios_y_no_acepta_otros(
    client: TestClient, auth: Headers
) -> None:
    missing = profile_body()
    del missing["limitations"]

    assert client.put("/me/profile", headers=auth, json=missing).status_code == 422
    assert (
        client.put("/me/profile", headers=auth, json=profile_body(nombre="Juan")).status_code == 422
    )


def test_valida_el_paso_de_peso(client: TestClient, auth: Headers) -> None:
    for step in (0, 10):
        response = client.put("/me/profile", headers=auth, json=profile_body(weight_step_kg=step))
        assert response.status_code == 422, step


def test_sin_sesion(client: TestClient) -> None:
    assert client.put("/me/profile", json=profile_body()).status_code == 401
