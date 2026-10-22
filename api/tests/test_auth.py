from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.cli import create_user, set_password
from app.config import get_settings
from app.models import AppUser
from app.routers import auth
from app.security import create_access_token

EMAIL = "juan@example.com"
PASSWORD = "contraseña-de-prueba"


@pytest.fixture(autouse=True)
def _reset_failures() -> Iterator[None]:
    auth._failures.clear()
    yield
    auth._failures.clear()


@pytest.fixture
def user(db: Session) -> AppUser:
    return create_user(db, EMAIL, PASSWORD)


def login(client: TestClient, email: str = EMAIL, password: str = PASSWORD) -> str:
    response = client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    token: str = response.json()["access_token"]
    return token


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_login_devuelve_token_y_cookie(client: TestClient, user: AppUser) -> None:
    response = client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    cookie = response.headers["set-cookie"].lower()
    for attribute in ("httponly", "secure", "samesite=strict", "path=/auth"):
        assert attribute in cookie


def test_login_ignora_mayusculas_y_espacios_del_correo(client: TestClient, user: AppUser) -> None:
    login(client, email="  Juan@Example.com ")


@pytest.mark.parametrize(
    ("email", "password"), [(EMAIL, "otra-contraseña"), ("nadie@example.com", PASSWORD)]
)
def test_login_incorrecto(client: TestClient, user: AppUser, email: str, password: str) -> None:
    response = client.post("/auth/login", json={"email": email, "password": password})

    assert response.status_code == 401


def test_login_bloquea_tras_varios_fallos(client: TestClient, user: AppUser) -> None:
    for _ in range(get_settings().login_max_failures):
        client.post("/auth/login", json={"email": EMAIL, "password": "mal"})

    response = client.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})

    assert response.status_code == 429


def test_me_con_token(client: TestClient, user: AppUser) -> None:
    response = client.get("/me", headers=bearer(login(client)))

    assert response.status_code == 200
    assert response.json() == {"id": str(user.id), "email": EMAIL}


def test_me_sin_token(client: TestClient) -> None:
    assert client.get("/me").status_code == 401


def test_me_con_token_vencido(client: TestClient, user: AppUser) -> None:
    long_ago = datetime.now(UTC) - timedelta(hours=1)
    token = create_access_token(user.id, get_settings(), now=long_ago)

    assert client.get("/me", headers=bearer(token)).status_code == 401


def test_me_con_firma_ajena(client: TestClient, user: AppUser) -> None:
    payload = {"sub": str(user.id), "type": "access", "exp": datetime.now(UTC) + timedelta(hours=1)}
    token = jwt.encode(payload, "otro-secreto-de-al-menos-32-bytes!", algorithm="HS256")

    assert client.get("/me", headers=bearer(token)).status_code == 401


def test_refresh_rota_el_token(client: TestClient, user: AppUser) -> None:
    login(client)
    first = client.cookies["refresh_token"]

    response = client.post("/auth/refresh")

    assert response.status_code == 200
    assert client.get("/me", headers=bearer(response.json()["access_token"])).status_code == 200
    assert client.cookies["refresh_token"] != first


def test_reusar_un_refresh_rotado_cierra_todas_las_sesiones(
    client: TestClient, user: AppUser
) -> None:
    login(client)
    stolen = client.cookies["refresh_token"]
    client.post("/auth/refresh")
    current = client.cookies["refresh_token"]
    client.cookies.clear()

    reused = client.post("/auth/refresh", headers={"Cookie": f"refresh_token={stolen}"})
    after = client.post("/auth/refresh", headers={"Cookie": f"refresh_token={current}"})

    assert reused.status_code == 401
    assert after.status_code == 401


def test_refresh_sin_cookie(client: TestClient) -> None:
    assert client.post("/auth/refresh").status_code == 401


def test_logout_revoca_el_refresh(client: TestClient, user: AppUser) -> None:
    login(client)
    token = client.cookies["refresh_token"]

    assert client.post("/auth/logout").status_code == 204

    client.cookies.clear()
    response = client.post("/auth/refresh", headers={"Cookie": f"refresh_token={token}"})
    assert response.status_code == 401


def test_crear_usuario_repetido(db: Session, user: AppUser) -> None:
    with pytest.raises(ValueError, match="Ya existe"):
        create_user(db, EMAIL.upper(), PASSWORD)


def test_cambiar_contrasena(client: TestClient, db: Session, user: AppUser) -> None:
    set_password(db, EMAIL, "nueva-contraseña-larga")

    login(client, password="nueva-contraseña-larga")
