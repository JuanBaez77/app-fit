import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession
from app.models import Muscle, UserProfile
from app.schemas_sync import ProfileOut

router = APIRouter(tags=["me"])


class MeOut(BaseModel):
    id: uuid.UUID
    email: str


class ProfileIn(BaseModel):
    """El perfil entero. Todos los campos son obligatorios (null para vaciar uno): así, un
    cliente viejo que no conoce un campo nuevo no lo borra sin querer."""

    model_config = ConfigDict(extra="forbid")

    sex: str | None = Field(max_length=50)
    birth_year: int | None = Field(ge=1900, le=2100)
    height_cm: float | None = Field(gt=50, lt=260)
    experience_years: float | None = Field(ge=0, le=80)
    habitual_rir: int | None = Field(ge=0, le=5)
    goal: str | None = Field(max_length=2000)
    priority_muscles: list[str] | None
    phase: Literal["definicion", "volumen", "mantenimiento"] | None
    phase_start: date | None
    phase_target: str | None = Field(max_length=200)
    equipment: str | None = Field(max_length=2000)
    limitations: str | None = Field(max_length=2000)
    # NUMERIC(3, 2)
    weight_step_kg: float = Field(gt=0, le=9.99)
    send_discomfort_to_ai: bool


@router.get("/me")
def me(user: CurrentUser) -> MeOut:
    return MeOut(id=user.id, email=user.email)


@router.put("/me/profile")
def update_profile(data: ProfileIn, user: CurrentUser, db: DbSession) -> ProfileOut:
    """Reemplaza el perfil. Va solo con conexión: es una pantalla de ajustes, no de registro.
    Los otros dispositivos lo reciben en el próximo pull."""
    unknown = set(data.priority_muscles or []) - set(db.scalars(select(Muscle.id)))
    if unknown:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"Músculos desconocidos: {', '.join(sorted(unknown))}",
        )

    values = data.model_dump()
    for field in ("height_cm", "experience_years", "weight_step_kg"):
        if values[field] is not None:
            values[field] = Decimal(str(values[field]))
    now: datetime = db.scalar(select(func.now()))  # type: ignore[assignment]

    profile = db.get(UserProfile, user.id)
    if profile is None:
        profile = UserProfile(user_id=user.id)
        db.add(profile)
    for field, value in values.items():
        setattr(profile, field, value)
    profile.updated_at = profile.synced_at = now
    db.commit()
    return ProfileOut.model_validate(profile)
