"""Filas que viajan en la sincronización. Los ids los genera el cliente (UUID v7).

Los números viajan como float en el JSON; en la base son NUMERIC.
"""

import uuid
from datetime import date
from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field, field_validator

from app.schemas import OrmModel, RoutineOut


class SyncRow(OrmModel):
    id: uuid.UUID
    updated_at: AwareDatetime
    deleted_at: AwareDatetime | None = None


class SessionRow(SyncRow):
    routine_id: uuid.UUID | None = None
    routine_day_id: uuid.UUID | None = None
    date: date
    started_at: AwareDatetime | None = None
    ended_at: AwareDatetime | None = None
    sleep_hours: float | None = Field(default=None, ge=0, le=24)
    discomfort: str | None = Field(default=None, max_length=2000)


class SetLogRow(SyncRow):
    session_id: uuid.UUID
    exercise_id: uuid.UUID
    routine_day_exercise_id: uuid.UUID | None = None
    set_number: int = Field(ge=1)
    weight_kg: float = Field(ge=0, le=1000)
    reps: int = Field(gt=0, le=1000)
    rir: int | None = Field(default=None, ge=0, le=5)
    interaction_ms: int | None = Field(default=None, ge=0)
    logged_at: AwareDatetime


class BodyWeightRow(SyncRow):
    date: date
    kg: float = Field(gt=0, le=500)


class ExerciseMuscleRow(OrmModel):
    muscle_id: str
    # 1 directa, 0,5 indirecta
    factor: float

    @field_validator("factor")
    @classmethod
    def _factor(cls, value: float) -> float:
        if value not in (0.5, 1.0):
            raise ValueError("El factor es 1 (directa) o 0,5 (indirecta)")
        return value


class ExerciseRow(SyncRow):
    name: str = Field(min_length=1, max_length=200)
    brain_page: str | None = None
    kind: Literal["multiarticular", "aislamiento"] | None = None
    e1rm_eligible: bool = True
    muscles: list[ExerciseMuscleRow] = Field(min_length=1)


class PushIn(BaseModel):
    sessions: list[SessionRow] = Field(default_factory=list, max_length=2000)
    set_logs: list[SetLogRow] = Field(default_factory=list, max_length=5000)
    body_weights: list[BodyWeightRow] = Field(default_factory=list, max_length=2000)
    exercises: list[ExerciseRow] = Field(default_factory=list, max_length=500)


class Rejected(BaseModel):
    table: str
    id: uuid.UUID
    reason: str


class PushOut(BaseModel):
    applied: int
    # Ya estaban, o el servidor tenía una versión más nueva
    skipped: int
    rejected: list[Rejected]


class MuscleOut(OrmModel):
    id: str
    name: str
    parent_id: str | None


class ProfileOut(OrmModel):
    sex: str | None
    birth_year: int | None
    height_cm: float | None
    experience_years: float | None
    habitual_rir: int | None
    goal: str | None
    priority_muscles: list[str] | None
    phase: str | None
    phase_start: date | None
    phase_target: str | None
    equipment: str | None
    limitations: str | None
    weight_step_kg: float
    send_discomfort_to_ai: bool
    updated_at: AwareDatetime


class PullOut(BaseModel):
    # Se manda como since en el próximo pull
    cursor: AwareDatetime
    sessions: list[SessionRow]
    set_logs: list[SetLogRow]
    body_weights: list[BodyWeightRow]
    exercises: list[ExerciseRow]
    routines: list[RoutineOut]
    profile: ProfileOut | None
    muscles: list[MuscleOut]
