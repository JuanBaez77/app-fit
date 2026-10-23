"""Un análisis del brain de punta a punta: arma la entrada, llama, valida y guarda (T3.4)."""

import uuid
from collections.abc import Callable
from datetime import date
from typing import Any

import anthropic
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.brain.bundles import latest_bundle
from app.brain.client import (
    DEFAULT_EFFORT,
    DEFAULT_MODEL,
    BrainError,
    Completion,
    build_request,
    complete,
    parse,
)
from app.brain.prompt import PROMPT_VERSION
from app.brain.schema import AnalysisOut
from app.brain.summary import Window, build_summary
from app.brain.validate import check
from app.models import Analysis, AppUser, Muscle, Routine

Call = Callable[[dict[str, Any]], Completion]


class AnalysisUnavailable(Exception):
    """Falta algo para poder analizar (el bundle o la rutina)."""


def default_call() -> Call:
    client = anthropic.Anthropic()
    return lambda request: complete(client, request)


def _retry(request: dict[str, Any], completion: Completion, error: BrainError) -> dict[str, Any]:
    """El mismo pedido, con la respuesta anterior y el error, para que la corrija."""
    return {
        **request,
        "messages": [
            *request["messages"],
            {"role": "assistant", "content": completion.text},
            {
                "role": "user",
                "content": f"La respuesta anterior no sirve: {error}. Devolvé solo el JSON "
                "corregido, con el mismo esquema.",
            },
        ],
    }


def run_analysis(
    db: Session,
    user: AppUser,
    window: Window,
    today: date,
    call: Call,
    model: str = DEFAULT_MODEL,
    effort: str = DEFAULT_EFFORT,
) -> Analysis:
    """Guarda el análisis siempre: ok con la respuesta validada, o fallido con la respuesta
    cruda y el motivo. Si la respuesta no cumple el esquema, reintenta una vez con el error."""
    bundle = latest_bundle(db)
    if bundle is None:
        raise AnalysisUnavailable("Falta subir el bundle del brain (make upload-bundle)")
    routine = db.scalar(
        select(Routine).where(Routine.user_id == user.id, Routine.status == "vigente")
    )
    if routine is None:
        raise AnalysisUnavailable("Todavía no hay rutina para analizar")

    summary, aliases = build_summary(db, user, window, today)
    request = build_request(bundle.content, summary, model, effort)
    analysis = Analysis(
        id=uuid.uuid4(),
        user_id=user.id,
        window_from=window.start,
        window_to=window.end,
        routine_id=routine.id,
        brain_version=bundle.version,
        model=model,
        prompt_version=PROMPT_VERSION,
        metrics_json=summary,
        aliases_json=aliases.as_json(),
        input_tokens=0,
        output_tokens=0,
        cache_read_tokens=0,
    )

    def attempt(req: dict[str, Any]) -> tuple[Completion, AnalysisOut | BrainError]:
        completion = call(req)
        analysis.model = completion.model
        analysis.input_tokens = (analysis.input_tokens or 0) + (
            completion.usage.get("input_tokens") or 0
        )
        analysis.output_tokens = (analysis.output_tokens or 0) + (
            completion.usage.get("output_tokens") or 0
        )
        analysis.cache_read_tokens = (analysis.cache_read_tokens or 0) + (
            completion.usage.get("cache_read_input_tokens") or 0
        )
        try:
            return completion, parse(completion)
        except BrainError as error:
            return completion, error

    completion, result = attempt(request)
    # Un rechazo no se arregla reintentando, y sin texto no hay qué corregir
    if isinstance(result, BrainError) and completion.stop_reason != "refusal" and completion.text:
        completion, result = attempt(_retry(request, completion, result))

    if isinstance(result, BrainError):
        analysis.status = "fallido"
        analysis.raw_response = completion.text
        analysis.error = str(result)
    else:
        muscles = set(db.scalars(select(Muscle.id)))
        checked = check(result, set(bundle.pages_json), aliases, routine, muscles)
        analysis.status = "ok"
        analysis.response_json = checked.response
        analysis.discarded_json = checked.discarded or None
        analysis.changes = checked.changes
    db.add(analysis)
    db.commit()
    return analysis
