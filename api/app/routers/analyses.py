import threading
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.brain.analyze import AnalysisUnavailable, Call, default_call, run_analysis
from app.brain.summary import Window, weeks_window
from app.deps import AppSettings, CurrentUser, DbSession
from app.models import Analysis, Routine
from app.schemas import OrmModel

router = APIRouter(prefix="/analyses", tags=["analyses"])


def brain_call(settings: AppSettings) -> Call:
    """La llamada real a Claude. Los tests la reemplazan por un cliente simulado."""
    # El SDK no falla al crearse sin credenciales sino al pedir: mejor avisar antes
    if not settings.anthropic_api_key:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Falta configurar ANTHROPIC_API_KEY en el servidor",
        )
    return default_call(settings.anthropic_api_key)


BrainCall = Annotated[Call, Depends(brain_call)]


class AnalysisIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # 1w: la última semana; 4w: las últimas 4; version: desde que rige la rutina vigente
    window: Literal["1w", "4w", "version"] = "4w"
    # El día local del celular: el servidor está en UTC y a la noche ya sería mañana
    today: date


class ChangeOut(OrmModel):
    id: uuid.UUID
    position: int
    type: str
    target: dict[str, Any] = Field(validation_alias="target_json")
    title: str
    rationale: str | None
    expectation: str | None
    basis: str | None
    evidence_level: int | None
    evidence_links: list[str] | None = Field(validation_alias="evidence_links_json")
    # Citas que no existen en el brain: el cambio queda "sin respaldo verificable"
    dropped_links: list[str] | None = Field(validation_alias="dropped_links_json")
    status: str
    decided_at: datetime | None
    applied_routine_id: uuid.UUID | None


class AnalysisSummaryOut(OrmModel):
    id: uuid.UUID
    created_at: datetime
    window_from: date
    window_to: date
    status: str
    routine_id: uuid.UUID
    brain_version: str
    model: str


class AnalysisOut(AnalysisSummaryOut):
    prompt_version: str
    error: str | None
    # Lo que se mandó (con alias) y lo que volvió validado
    metrics: dict[str, Any] = Field(validation_alias="metrics_json")
    response: dict[str, Any] | None = Field(validation_alias="response_json")
    discarded: list[dict[str, Any]] | None = Field(validation_alias="discarded_json")
    changes: list[ChangeOut]


_running: set[uuid.UUID] = set()
_running_lock = threading.Lock()


@contextmanager
def _one_at_a_time(user_id: uuid.UUID) -> Iterator[None]:
    """Un análisis por usuario a la vez: un doble toque no gasta dos veces."""
    with _running_lock:
        if user_id in _running:
            raise HTTPException(status.HTTP_409_CONFLICT, "Ya hay un análisis en curso")
        _running.add(user_id)
    try:
        yield
    finally:
        with _running_lock:
            _running.discard(user_id)


def window_for(kind: str, today: date, routine: Routine) -> Window:
    if kind == "1w":
        return weeks_window(today, 1, "la última semana")
    if kind == "4w":
        return weeks_window(today, 4, "las últimas 4 semanas")
    # La v1 rige desde el inicio de la rutina; las demás, desde que se crearon
    if routine.parent_routine_id is None and routine.start_on is not None:
        start = routine.start_on
    else:
        start = routine.created_at.date()
    end = today - timedelta(days=1)
    return Window(min(start, end), end, f"desde la versión {routine.version} de la rutina")


@router.post("", status_code=status.HTTP_201_CREATED)
def create_analysis(
    data: AnalysisIn,
    user: CurrentUser,
    db: DbSession,
    settings: AppSettings,
    call: BrainCall,
) -> AnalysisOut:
    """Pide un análisis (US-16). Tarda: el proxy espera hasta 300 s. Si la API de Claude
    falla, el análisis queda fallido con el motivo y no se pierde nada."""
    if abs((data.today - datetime.now(UTC).date()).days) > 1:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "La fecha del celular no coincide con la de hoy"
        )
    routine = db.scalar(
        select(Routine).where(Routine.user_id == user.id, Routine.status == "vigente")
    )
    if routine is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Todavía no hay rutina para analizar")
    window = window_for(data.window, data.today, routine)
    with _one_at_a_time(user.id):
        try:
            analysis = run_analysis(
                db, user, window, data.today, call, settings.brain_model, settings.brain_effort
            )
        except AnalysisUnavailable as error:
            raise HTTPException(status.HTTP_409_CONFLICT, str(error)) from None
    return AnalysisOut.model_validate(analysis)


@router.get("")
def list_analyses(user: CurrentUser, db: DbSession) -> list[AnalysisSummaryOut]:
    """Los análisis, el más nuevo primero."""
    analyses = db.scalars(
        select(Analysis)
        .where(Analysis.user_id == user.id)
        .order_by(Analysis.created_at.desc())
        .limit(50)
    )
    return [AnalysisSummaryOut.model_validate(a) for a in analyses]


@router.get("/{analysis_id}")
def get_analysis(analysis_id: uuid.UUID, user: CurrentUser, db: DbSession) -> AnalysisOut:
    analysis = db.get(Analysis, analysis_id)
    if analysis is None or analysis.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No existe ese análisis")
    return AnalysisOut.model_validate(analysis)
