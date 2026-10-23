import os
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.cli import create_user
from app.config import get_settings
from app.db import get_db
from app.main import app
from app.models import AppUser, BrainBundle
from app.security import create_access_token
from tests.fakes import PAGES

API_DIR = Path(__file__).resolve().parent.parent

# Los tests usan la configuración de producción, no la del compose de dev.
# No hay nginx adelante que agregue /api.
os.environ["COOKIE_PATH"] = "/auth"
os.environ["COOKIE_SECURE"] = "true"


def _test_url() -> str:
    """La misma base que DATABASE_URL con el sufijo _test."""
    url = make_url(get_settings().database_url)
    return url.set(database=f"{url.database}_test").render_as_string(hide_password=False)


def _alembic_config(url: str) -> Config:
    config = Config(str(API_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return config


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    url = _test_url()
    name = make_url(url).database
    admin = create_engine(make_url(url).set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        connection.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        connection.execute(text(f'CREATE DATABASE "{name}"'))
    admin.dispose()

    # Sube, baja y vuelve a subir: toda migración tiene que poder bajar limpia
    config = _alembic_config(url)
    command.upgrade(config, "head")
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    # Los modelos y las migraciones no pueden divergir
    command.check(config)

    test_engine = create_engine(url)
    yield test_engine
    test_engine.dispose()


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    """Cada test corre en una transacción que se descarta al final."""
    with engine.connect() as connection:
        transaction = connection.begin()
        session = Session(
            bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
        )
        yield session
        session.close()
        transaction.rollback()


@pytest.fixture
def user(db: Session) -> AppUser:
    return create_user(db, "juan@example.com", "contraseña-de-prueba")


@pytest.fixture
def auth(user: AppUser) -> dict[str, str]:
    """Header de autorización del usuario de prueba."""
    return {"Authorization": f"Bearer {create_access_token(user.id, get_settings())}"}


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    # https para que viaje la cookie Secure del refresh
    with TestClient(app, base_url="https://testserver") as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def ready(client: TestClient, auth: dict[str, str], db: Session) -> TestClient:
    """Con la rutina importada y un bundle: lista para pedir análisis."""
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
    return client
