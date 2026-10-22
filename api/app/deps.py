from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.models import AppUser
from app.security import decode_access_token

DbSession = Annotated[Session, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]

_bearer = HTTPBearer(auto_error=False)


def current_user(
    db: DbSession,
    settings: AppSettings,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> AppUser:
    unauthorized = HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        "Sesión vencida o inválida",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    user_id = decode_access_token(credentials.credentials, settings)
    user = db.get(AppUser, user_id) if user_id else None
    if user is None:
        raise unauthorized
    return user


CurrentUser = Annotated[AppUser, Depends(current_user)]
