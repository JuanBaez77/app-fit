"""Esquemas de salida compartidos por los routers."""

import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict


class OrmModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RoutineDayExerciseOut(OrmModel):
    id: uuid.UUID
    exercise_id: uuid.UUID
    position: int
    target_sets: int
    reps_min: int
    reps_max: int
    rir_min: int | None
    rir_max: int | None
    rest_min_sec: int | None
    rest_max_sec: int | None
    ramp_sets: int | None
    ramp_weeks: int | None
    note: str | None


class RoutineDayOut(OrmModel):
    id: uuid.UUID
    name: str
    weekday: int | None
    position: int
    exercises: list[RoutineDayExerciseOut]


class MuscleTargetOut(OrmModel):
    muscle_id: str
    target_sets: float
    fractional_target: float | None
    range_min: float | None
    range_max: float | None
    priority: str | None


class RoutineOut(OrmModel):
    id: uuid.UUID
    version: int
    status: str
    source: str | None
    parent_routine_id: uuid.UUID | None
    start_on: date | None
    review_on: date | None
    days: list[RoutineDayOut]
    muscle_targets: list[MuscleTargetOut]
