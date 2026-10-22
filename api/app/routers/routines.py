from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select

from app.deps import CurrentUser, DbSession
from app.models import Routine
from app.schemas import RoutineOut
from app.services.seed import import_initial

router = APIRouter(prefix="/routines", tags=["routines"])


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
