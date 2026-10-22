import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from app.brain.client import (
    FALLBACK_BETA,
    BrainError,
    Completion,
    build_request,
    complete,
    count_tokens,
    load_bundle,
    parse,
    unknown_links,
)
from app.brain.schema import output_schema

# El ejemplo de salida de la sección 5 del diseño
EXAMPLE = {
    "summary": "Cargas sostenidas durante la definición.",
    "confidence": "media",
    "confidence_reason": "4 semanas de datos y RIR registrado en 62 % de las series.",
    "exercise_assessments": [
        {
            "exercise_id": "ex-banca",
            "status": "progresa",
            "comment": "Mejor marca nueva con el mismo RIR.",
            "basis": "evidencia",
            "evidence_links": ["progresar-da-mas-hipertrofia-que-no-progresar"],
        }
    ],
    "muscle_assessments": [
        {
            "muscle_id": "deltoides_lateral",
            "verdict": "por_debajo",
            "comment": "Por debajo del rango de la rutina.",
            "evidence_links": ["volumen-semanal-dosis-respuesta-hipertrofia"],
        }
    ],
    "alerts": [{"kind": "datos", "severity": "info", "text": "Falta RIR en parte de las series."}],
    "changes": [
        {
            "type": "set_sets",
            "target": {"routine_day_exercise_id": "rde-9", "from": 4, "to": 5},
            "title": "Sumar 1 serie de elevaciones laterales en Empuje",
            "rationale": "El volumen semanal quedó por debajo del rango.",
            "expectation": "Acercar el volumen al rango objetivo.",
            "basis": "evidencia",
            "evidence_level": 1,
            "evidence_links": ["volumen-semanal-dosis-respuesta-hipertrofia"],
        }
    ],
    "data_gaps": ["No se registró RIR en el 38 % de las series."],
    "notes": [],
}


def completion(text: str, stop_reason: str = "end_turn") -> Completion:
    return Completion(model="claude-opus-5-5", stop_reason=stop_reason, text=text, usage={})


def test_la_llamada_cachea_el_bundle_al_final_del_system() -> None:
    request = build_request("<brain/>", {"a": 1}, "claude-opus-5-5", "high")

    system = request["system"]
    assert [("cache_control" in block) for block in system] == [False, False, True]
    assert system[2]["text"] == "<brain/>"
    assert request["messages"][0]["content"] == '<input>\n{"a": 1}\n</input>'
    assert request["output_config"]["effort"] == "high"
    assert request["output_config"]["format"]["type"] == "json_schema"


def test_el_esquema_no_admite_campos_de_mas() -> None:
    schema = output_schema()
    objects = [schema, *schema["$defs"].values()]

    assert all(obj.get("additionalProperties") is False for obj in objects)
    assert "from" in schema["$defs"]["ChangeTarget"]["properties"]


def test_el_ejemplo_del_diseno_cumple_el_esquema() -> None:
    analysis = parse(completion(json.dumps(EXAMPLE)))

    assert analysis.changes[0].target.from_ == 4
    assert analysis.model_dump(by_alias=True)["changes"][0]["target"]["from"] == 4


@pytest.mark.parametrize(
    ("text", "stop_reason", "message"),
    [
        ("", "refusal", "rechazó"),
        ('{"summary": "cortado', "max_tokens", "max_tokens"),
        ('{"summary": "falta todo"}', "end_turn", "no cumple el esquema"),
    ],
)
def test_respuestas_que_no_sirven(text: str, stop_reason: str, message: str) -> None:
    with pytest.raises(BrainError, match=message):
        parse(completion(text, stop_reason))


def test_detecta_citas_que_no_estan_en_el_brain() -> None:
    analysis = parse(completion(json.dumps(EXAMPLE)))

    pages = {"volumen-semanal-dosis-respuesta-hipertrofia"}

    assert unknown_links(analysis, pages) == ["progresar-da-mas-hipertrofia-que-no-progresar"]


class FakeStream:
    def __init__(self, message: Any) -> None:
        self.message = message

    def __enter__(self) -> "FakeStream":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def get_final_message(self) -> Any:
        return self.message


def test_complete_pide_fallback_y_junta_texto_y_tokens() -> None:
    calls: list[dict[str, Any]] = []
    message = SimpleNamespace(
        model="claude-opus-5-5",
        stop_reason="end_turn",
        stop_details=None,
        content=[
            SimpleNamespace(type="thinking", thinking=""),
            SimpleNamespace(type="text", text='{"a":'),
            SimpleNamespace(type="text", text=" 1}"),
        ],
        usage=SimpleNamespace(
            input_tokens=1200,
            output_tokens=900,
            cache_creation_input_tokens=50000,
            cache_read_input_tokens=0,
        ),
    )

    def stream(**kwargs: Any) -> FakeStream:
        calls.append(kwargs)
        return FakeStream(message)

    client: Any = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(stream=stream)))
    request = build_request("<brain/>", {}, "claude-opus-5-5", "high")

    result = complete(client, request)

    assert calls[0]["betas"] == [FALLBACK_BETA]
    assert calls[0]["fallbacks"] == "default"
    assert result.text == '{"a": 1}'
    assert result.usage["cache_creation_input_tokens"] == 50000


def test_complete_informa_la_categoria_del_rechazo() -> None:
    message = SimpleNamespace(
        model="claude-opus-5-5",
        stop_reason="refusal",
        stop_details=SimpleNamespace(category="bio"),
        content=[],
        usage=SimpleNamespace(
            input_tokens=1,
            output_tokens=0,
            cache_creation_input_tokens=0,
            cache_read_input_tokens=0,
        ),
    )
    client: Any = SimpleNamespace(
        beta=SimpleNamespace(messages=SimpleNamespace(stream=lambda **_: FakeStream(message)))
    )

    with pytest.raises(BrainError, match="bio"):
        parse(complete(client, build_request("", {}, "m", "high")))


def test_contar_tokens_no_manda_max_tokens() -> None:
    seen: dict[str, Any] = {}

    def count(**kwargs: Any) -> Any:
        seen.update(kwargs)
        return SimpleNamespace(input_tokens=51234)

    client: Any = SimpleNamespace(messages=SimpleNamespace(count_tokens=count))

    assert count_tokens(client, build_request("<brain/>", {}, "claude-opus-5-5", "high")) == 51234
    assert "max_tokens" not in seen


def test_lee_el_bundle_que_arma_el_script(tmp_path: Path) -> None:
    (tmp_path / "bundle-abc.xml").write_text("<brain/>", encoding="utf-8")
    (tmp_path / "pages-abc.json").write_text(
        json.dumps([{"name": "volumen", "folder": "conceptos", "included": True}]),
        encoding="utf-8",
    )
    manifest = tmp_path / "latest.json"
    manifest.write_text(
        json.dumps({"version": "abc", "bundle": "bundle-abc.xml", "pages": "pages-abc.json"}),
        encoding="utf-8",
    )

    bundle = load_bundle(manifest)

    assert (bundle.version, bundle.xml, bundle.pages) == ("abc", "<brain/>", {"volumen"})
