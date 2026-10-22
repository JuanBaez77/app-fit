"""Llamada a la API de Claude con el bundle del brain como contexto."""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import anthropic
from pydantic import ValidationError

from app.brain.prompt import SYSTEM_OUTPUT, SYSTEM_RULES
from app.brain.schema import AnalysisOut, evidence_links, output_schema

DEFAULT_MODEL = "claude-opus-5-5"
# En Claude Opus 5.5 el effort por defecto es medium: se pide explícito
DEFAULT_EFFORT = "high"
# Con streaming no hay riesgo de timeout HTTP; el pensamiento también cuenta contra este tope
MAX_TOKENS = 32_000
# Si el modelo rechaza el pedido, la API lo reintenta en el modelo que corresponda
FALLBACK_BETA = "server-side-fallback-2026-07-01"


class BrainError(Exception):
    pass


@dataclass
class Bundle:
    version: str
    xml: str
    # Páginas citables: contra esto se validan las citas
    pages: set[str]


@dataclass
class Completion:
    model: str
    stop_reason: str | None
    text: str
    usage: dict[str, int | None]
    refusal_category: str | None = None


def load_bundle(manifest_path: Path) -> Bundle:
    """Lee el bundle que dejó brain/build_bundle.py (latest.json y sus archivos)."""
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    folder = manifest_path.parent
    pages = json.loads((folder / manifest["pages"]).read_text(encoding="utf-8"))
    return Bundle(
        version=manifest["version"],
        xml=(folder / manifest["bundle"]).read_text(encoding="utf-8"),
        pages={page["name"] for page in pages},
    )


def build_request(
    bundle_xml: str, input_data: dict[str, Any], model: str, effort: str
) -> dict[str, Any]:
    """Arma la llamada: reglas y formato primero, el bundle cacheable al final del system, y el
    JSON de entrada como mensaje. Lo estable va antes de lo que cambia en cada análisis."""
    return {
        "model": model,
        "max_tokens": MAX_TOKENS,
        "system": [
            {"type": "text", "text": SYSTEM_RULES},
            {"type": "text", "text": SYSTEM_OUTPUT},
            {"type": "text", "text": bundle_xml, "cache_control": {"type": "ephemeral"}},
        ],
        "messages": [
            {
                "role": "user",
                "content": f"<input>\n{json.dumps(input_data, ensure_ascii=False)}\n</input>",
            }
        ],
        "output_config": {
            "effort": effort,
            "format": {"type": "json_schema", "schema": output_schema()},
        },
    }


def count_tokens(client: anthropic.Anthropic, request: dict[str, Any]) -> int:
    """Tokens de entrada reales, sin llamar al modelo (no cuesta)."""
    params = {key: value for key, value in request.items() if key != "max_tokens"}
    return client.messages.count_tokens(**params).input_tokens


def complete(client: anthropic.Anthropic, request: dict[str, Any]) -> Completion:
    with client.beta.messages.stream(
        **request, betas=[FALLBACK_BETA], fallbacks="default"
    ) as stream:
        message = stream.get_final_message()
    usage = message.usage
    category = None
    if message.stop_reason == "refusal" and message.stop_details is not None:
        category = message.stop_details.category
    return Completion(
        # Si hubo fallback, es el modelo que terminó respondiendo
        model=message.model,
        stop_reason=message.stop_reason,
        text="".join(block.text for block in message.content if block.type == "text"),
        usage={
            "input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
            "cache_creation_input_tokens": usage.cache_creation_input_tokens,
            "cache_read_input_tokens": usage.cache_read_input_tokens,
        },
        refusal_category=category,
    )


def parse(completion: Completion) -> AnalysisOut:
    if completion.stop_reason == "refusal":
        raise BrainError(f"El modelo rechazó el pedido (categoría: {completion.refusal_category}).")
    if completion.stop_reason == "max_tokens":
        raise BrainError("La respuesta se cortó por max_tokens.")
    try:
        return AnalysisOut.model_validate_json(completion.text)
    except ValidationError as error:
        raise BrainError(f"La respuesta no cumple el esquema: {error}") from error


def unknown_links(analysis: AnalysisOut, pages: set[str]) -> list[str]:
    """Citas que no existen en el bundle (PR-26 las descarta; acá solo se informan)."""
    return sorted(evidence_links(analysis) - pages)
