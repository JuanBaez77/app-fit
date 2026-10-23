"""Un Claude de mentira para los tests del análisis: no llama a la API ni gasta."""

import json
from datetime import UTC, datetime
from typing import Any

import httpx2
from fastapi.testclient import TestClient

from app.brain.client import Completion
from app.main import app
from app.routers.analyses import brain_call

PAGES = ["volumen", "press-de-banca", "rir"]

TODAY = datetime.now(UTC).date()


def use(call: Any) -> None:
    """Las llamadas a Claude de la API pasan por call."""
    app.dependency_overrides[brain_call] = lambda: call


def analyze(client: TestClient, auth: dict[str, str], **body: Any) -> httpx2.Response:
    """POST /analyses con el día de hoy."""
    return client.post("/analyses", headers=auth, json={"today": TODAY.isoformat(), **body})


class FakeClaude:
    """Devuelve los textos en orden (el último se repite) y guarda los pedidos."""

    def __init__(self, *texts: str, stop_reason: str = "end_turn") -> None:
        self.texts = texts
        self.stop_reason = stop_reason
        self.requests: list[dict[str, Any]] = []

    def __call__(self, request: dict[str, Any]) -> Completion:
        self.requests.append(request)
        text = self.texts[min(len(self.requests), len(self.texts)) - 1]
        return Completion(
            model="claude-opus-5-5",
            stop_reason=self.stop_reason,
            text=text,
            usage={
                "input_tokens": 1000,
                "output_tokens": 200,
                "cache_creation_input_tokens": 0,
                "cache_read_input_tokens": 900,
            },
        )


def change(
    type_: str,
    target: dict[str, Any],
    basis: str = "evidencia",
    level: int | None = 2,
    links: tuple[str, ...] = ("volumen",),
) -> dict[str, Any]:
    return {
        "type": type_,
        "target": target,
        "title": f"Cambio {type_}",
        "rationale": "Porque sí.",
        "expectation": "Algo mejor.",
        "basis": basis,
        "evidence_level": level,
        "evidence_links": list(links),
    }


def answer(*changes: dict[str, Any]) -> str:
    return json.dumps(
        {
            "summary": "Vas bien.",
            "confidence": "media",
            "confidence_reason": "4 semanas de datos.",
            "exercise_assessments": [
                {
                    "exercise_id": "ex-press-banca-barra",
                    "status": "mantiene",
                    "comment": "Estable.",
                    "basis": "practica",
                    "evidence_links": ["press-de-banca", "pagina-inventada"],
                }
            ],
            "muscle_assessments": [],
            "alerts": [],
            "changes": list(changes),
            "data_gaps": [],
            "notes": [],
        }
    )
