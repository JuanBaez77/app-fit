import uuid
from datetime import date, datetime

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select

from app.deps import CurrentUser, DbSession
from app.models import Exercise, Routine
from app.schemas import OrmModel, RoutineOut
from app.services.seed import import_initial
from app.services.versions import (
    ChangeError,
    NewVersionIn,
    StaleRoutine,
    apply_day_edits,
    new_version,
    restore_from,
    usable_exercises,
)

router = APIRouter(prefix="/routines", tags=["routines"])


class RoutineSummaryOut(OrmModel):
    id: uuid.UUID
    version: int
    status: str
    source: str | None
    start_on: date | None
    created_at: datetime


@router.post("/import")
def import_routine(user: CurrentUser, db: DbSession, response: Response) -> RoutineOut:
    """Primer uso: crea la rutina v1, el catálogo y el perfil. Repetirlo no duplica nada."""
    routine, created = import_initial(db, user)
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return RoutineOut.model_validate(routine)


@router.get("/current")
def current_routine(user: CurrentUser, db: DbSession) -> RoutineOut:
    routine = db.scalar(
        select(Routine).where(Routine.user_id == user.id, Routine.status == "vigente")
    )
    if routine is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Todavía no hay rutina")
    return RoutineOut.model_validate(routine)


@router.get("")
def list_versions(user: CurrentUser, db: DbSession) -> list[RoutineSummaryOut]:
    """Todas las versiones, la más nueva primero."""
    routines = db.scalars(
        select(Routine).where(Routine.user_id == user.id).order_by(Routine.version.desc())
    )
    return [RoutineSummaryOut.model_validate(r) for r in routines]


@router.get("/{routine_id}")
def get_version(routine_id: uuid.UUID, user: CurrentUser, db: DbSession) -> RoutineOut:
    """Una versión cualquiera: las anteriores siguen consultables."""
    routine = db.get(Routine, routine_id)
    if routine is None or routine.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No existe esa versión")
    return RoutineOut.model_validate(routine)


@router.post("/{routine_id}/versions", status_code=status.HTTP_201_CREATED)
def edit_routine(
    routine_id: uuid.UUID, data: NewVersionIn, user: CurrentUser, db: DbSession
) -> RoutineOut:
    """Edición manual (US-02): crea la versión siguiente. Va solo con conexión."""
    base = db.get(Routine, routine_id, with_for_update=True)
    if base is None or base.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No existe esa versión")
    try:
        routine = new_version(
            db, base, "manual", apply_day_edits(data.days, usable_exercises(db, user.id))
        )
    except StaleRoutine:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "La rutina cambió mientras la editabas: volvé a abrirla"
        ) from None
    except ChangeError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(error)) from None
    return RoutineOut.model_validate(routine)


@router.post("/{routine_id}/restore", status_code=status.HTTP_201_CREATED)
def restore_version(routine_id: uuid.UUID, user: CurrentUser, db: DbSession) -> RoutineOut:
    """Volver a una versión (US-19): crea otra con su contenido; la historia queda entera."""
    old = db.get(Routine, routine_id)
    if old is None or old.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No existe esa versión")
    if old.status == "vigente":
        raise HTTPException(status.HTTP_409_CONFLICT, "Esa ya es la versión vigente")
    base = db.scalar(
        select(Routine)
        .where(Routine.user_id == user.id, Routine.status == "vigente")
        .with_for_update()
    )
    if base is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Todavía no hay rutina")
    names = {e.id: e.name for e in db.scalars(select(Exercise).where(Exercise.user_id == user.id))}
    try:
        routine = new_version(
            db, base, "manual", restore_from(old, usable_exercises(db, user.id), names)
        )
    except ChangeError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(error)) from None
    return RoutineOut.model_validate(routine)
