"""Importación inicial: catálogo, rutina v1 y perfil desde api/seeds/ (US-01, US-03)."""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, TypeAdapter
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    AppUser,
    Exercise,
    ExerciseMuscle,
    Routine,
    RoutineDay,
    RoutineDayExercise,
    RoutineMuscleTarget,
    UserProfile,
)

SEEDS_DIR = Path(__file__).resolve().parents[2] / "seeds"
ROUTINE_FILE = "rutina-2026-10-20.yaml"
# La rutina usa las series de "rampa" durante las semanas 1 y 2
RAMP_WEEKS = 2


class CatalogExercise(BaseModel):
    nombre: str
    tipo: Literal["multiarticular", "aislamiento"]
    brain_page: str | None = None
    e1rm: bool = True
    musculos: dict[str, Decimal]


class Catalog(BaseModel):
    ejercicios: dict[str, CatalogExercise]


class SeedDayExercise(BaseModel):
    ejercicio: str
    series: int
    rampa: int | None = None
    reps: tuple[int, int]
    rir: tuple[int, int]
    descanso: tuple[int, int]
    nota: str | None = None


class SeedDay(BaseModel):
    nombre: str
    dia: int
    ejercicios: list[SeedDayExercise]


class SeedMuscleTarget(BaseModel):
    directas: Decimal
    rango: tuple[Decimal, Decimal] | None = None
    fraccionales: Decimal
    prioridad: Literal["alta", "media", "mantenimiento"]


class SeedRoutine(BaseModel):
    inicio: date
    revision: date
    dias: list[SeedDay]
    musculos: dict[str, SeedMuscleTarget]


class SeedProfile(BaseModel):
    sexo: str
    anio_nacimiento: int
    altura_cm: Decimal
    anios_experiencia: Decimal
    rir_habitual: int
    objetivo: str
    musculos_prioritarios: list[str]
    fase: Literal["definicion", "volumen", "mantenimiento"]
    fase_inicio: date
    fase_objetivo: str
    equipamiento: str
    limitaciones: str | None
    paso_peso_kg: Decimal


def _load[T](name: str, model: type[T]) -> T:
    raw = yaml.safe_load((SEEDS_DIR / name).read_text(encoding="utf-8"))
    return TypeAdapter(model).validate_python(raw)


def _catalog(db: Session, user: AppUser, now: datetime) -> dict[str, Exercise]:
    """Crea los ejercicios del catálogo que el usuario no tenga (por nombre)."""
    by_key: dict[str, Exercise] = {}
    for key, item in _load("catalogo.yaml", Catalog).ejercicios.items():
        exercise = db.scalar(
            select(Exercise).where(
                Exercise.user_id == user.id,
                Exercise.name == item.nombre,
                Exercise.deleted_at.is_(None),
            )
        )
        if exercise is None:
            exercise = Exercise(
                id=uuid.uuid4(),
                user_id=user.id,
                name=item.nombre,
                brain_page=item.brain_page,
                kind=item.tipo,
                e1rm_eligible=item.e1rm,
                updated_at=now,
                muscles=[
                    ExerciseMuscle(muscle_id=muscle, factor=factor)
                    for muscle, factor in item.musculos.items()
                ],
            )
            db.add(exercise)
        by_key[key] = exercise
    return by_key


def _profile(user: AppUser) -> UserProfile:
    p = _load("perfil.yaml", SeedProfile)
    return UserProfile(
        user_id=user.id,
        sex=p.sexo,
        birth_year=p.anio_nacimiento,
        height_cm=p.altura_cm,
        experience_years=p.anios_experiencia,
        habitual_rir=p.rir_habitual,
        goal=p.objetivo,
        priority_muscles=p.musculos_prioritarios,
        phase=p.fase,
        phase_start=p.fase_inicio,
        phase_target=p.fase_objetivo,
        equipment=p.equipamiento,
        limitations=p.limitaciones,
        weight_step_kg=p.paso_peso_kg,
        send_discomfort_to_ai=False,
    )


def import_initial(db: Session, user: AppUser) -> tuple[Routine, bool]:
    """Crea la rutina v1 importada. Si el usuario ya tiene rutina, no toca nada.

    Devuelve la rutina y si se creó ahora.
    """
    existing = db.scalar(
        select(Routine).where(Routine.user_id == user.id).order_by(Routine.version.desc())
    )
    if existing is not None:
        return existing, False

    seed = _load(ROUTINE_FILE, SeedRoutine)
    now = datetime.now(UTC)
    exercises = _catalog(db, user, now)

    days = []
    for position, day in enumerate(seed.dias, start=1):
        items = []
        for order, item in enumerate(day.ejercicios, start=1):
            if item.ejercicio not in exercises:
                raise ValueError(f"{ROUTINE_FILE}: '{item.ejercicio}' no está en el catálogo")
            items.append(
                RoutineDayExercise(
                    id=uuid.uuid4(),
                    exercise_id=exercises[item.ejercicio].id,
                    position=order,
                    target_sets=item.series,
                    reps_min=item.reps[0],
                    reps_max=item.reps[1],
                    rir_min=item.rir[0],
                    rir_max=item.rir[1],
                    rest_min_sec=item.descanso[0],
                    rest_max_sec=item.descanso[1],
                    ramp_sets=item.rampa,
                    ramp_weeks=RAMP_WEEKS if item.rampa else None,
                    note=item.nota,
                )
            )
        days.append(
            RoutineDay(
                id=uuid.uuid4(),
                name=day.nombre,
                weekday=day.dia,
                position=position,
                exercises=items,
            )
        )

    routine = Routine(
        id=uuid.uuid4(),
        user_id=user.id,
        version=1,
        status="vigente",
        source="importada",
        start_on=seed.inicio,
        review_on=seed.revision,
        days=days,
        muscle_targets=[
            RoutineMuscleTarget(
                muscle_id=muscle,
                target_sets=target.directas,
                fractional_target=target.fraccionales,
                range_min=target.rango[0] if target.rango else None,
                range_max=target.rango[1] if target.rango else None,
                priority=target.prioridad,
            )
            for muscle, target in seed.musculos.items()
        ],
    )
    db.add(routine)
    if db.get(UserProfile, user.id) is None:
        db.add(_profile(user))
    db.commit()
    return routine, True
