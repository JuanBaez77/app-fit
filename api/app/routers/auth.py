import uuid
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select, update

from app.config import Settings
from app.deps import AppSettings, DbSession
from app.models import AppUser, RefreshToken
from app.security import (
    create_access_token,
    hash_refresh_token,
    new_refresh_token,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"

# Intentos fallidos por IP. En memoria: alcanza para un solo usuario y un proceso por worker.
_failures: dict[str, list[datetime]] = defaultdict(list)


class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


def _too_many_failures(ip: str, settings: Settings, now: datetime) -> bool:
    window_start = now - timedelta(minutes=settings.login_window_minutes)
    _failures[ip] = [t for t in _failures[ip] if t > window_start]
    return len(_failures[ip]) >= settings.login_max_failures


def _issue_tokens(
    db: DbSession, user_id: uuid.UUID, response: Response, settings: Settings
) -> TokenOut:
    raw, token_hash = new_refresh_token()
    expires_at = datetime.now(UTC) + timedelta(days=settings.refresh_token_days)
    db.add(RefreshToken(user_id=user_id, token_hash=token_hash, expires_at=expires_at))
    db.commit()
    response.set_cookie(
        REFRESH_COOKIE,
        raw,
        max_age=settings.refresh_token_days * 24 * 3600,
        path=settings.cookie_path,
        secure=settings.cookie_secure,
        httponly=True,
        samesite="strict",
    )
    return TokenOut(
        access_token=create_access_token(user_id, settings),
        expires_in=settings.access_token_minutes * 60,
    )


@router.post("/login")
def login(
    body: LoginIn, request: Request, response: Response, db: DbSession, settings: AppSettings
) -> TokenOut:
    ip = request.client.host if request.client else "desconocida"
    now = datetime.now(UTC)
    if _too_many_failures(ip, settings, now):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "Demasiados intentos. Probá en unos minutos."
        )

    user = db.scalar(select(AppUser).where(AppUser.email == body.email.strip().lower()))
    if user is None or not verify_password(user.password_hash, body.password):
        _failures[ip].append(now)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Correo o contraseña incorrectos")

    _failures.pop(ip, None)
    return _issue_tokens(db, user.id, response, settings)


@router.post("/refresh")
def refresh(
    response: Response,
    db: DbSession,
    settings: AppSettings,
    refresh_token: Annotated[str | None, Cookie()] = None,
) -> TokenOut:
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión vencida")
    if not refresh_token:
        raise unauthorized
    stored = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(refresh_token))
    )
    if stored is None:
        raise unauthorized

    now = datetime.now(UTC)
    if stored.revoked_at is not None:
        # Un refresh ya rotado se volvió a usar: alguien más lo tiene.
        # Se cierran todas las sesiones.
        db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == stored.user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        db.commit()
        raise unauthorized
    if stored.expires_at <= now:
        raise unauthorized

    stored.revoked_at = now
    return _issue_tokens(db, stored.user_id, response, settings)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    db: DbSession,
    settings: AppSettings,
    refresh_token: Annotated[str | None, Cookie()] = None,
) -> None:
    if refresh_token:
        db.execute(
            update(RefreshToken)
            .where(
                RefreshToken.token_hash == hash_refresh_token(refresh_token),
                RefreshToken.revoked_at.is_(None),
            )
            .values(revoked_at=datetime.now(UTC))
        )
        db.commit()
    response.delete_cookie(
        REFRESH_COOKIE,
        path=settings.cookie_path,
        secure=settings.cookie_secure,
        httponly=True,
        samesite="strict",
    )
