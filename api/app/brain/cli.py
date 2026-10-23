"""Prueba del prompt del brain a mano, sin la app (T3.2).

    python -m app.brain.cli analyze CASO.json --bundle /brain/out/latest.json
    python -m app.brain.cli analyze CASO.json --count-only
    python -m app.brain.cli summary juan@ejemplo.com --weeks 4 --out /brain/cases/mio.json

Desde la raíz del repo: sh scripts/brain-analyze.sh CASO.json. Lee la API key de
ANTHROPIC_API_KEY (o de un perfil de `ant auth login`) y el modelo de BRAIN_MODEL.
Cada corrida queda en --out como JSON: respuesta, tokens, modelo y versiones.
"""

import argparse
import json
import os
import sys
import time
from datetime import UTC, date, datetime
from pathlib import Path

import anthropic
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.brain.client import (
    DEFAULT_EFFORT,
    DEFAULT_MODEL,
    BrainError,
    build_request,
    complete,
    count_tokens,
    load_bundle,
    parse,
    unknown_links,
)
from app.brain.prompt import PROMPT_VERSION
from app.brain.summary import build_summary, weeks_window
from app.db import get_engine
from app.models import AppUser


def analyze(args: argparse.Namespace) -> int:
    case = Path(args.input)
    bundle = load_bundle(Path(args.bundle))
    request = build_request(
        bundle.xml, json.loads(case.read_text(encoding="utf-8")), args.model, args.effort
    )
    # Dentro del contenedor no hay perfil de `ant auth login`: la credencial viene del entorno
    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        print(
            "Falta ANTHROPIC_API_KEY en el entorno (export ANTHROPIC_API_KEY=...).", file=sys.stderr
        )
        return 2
    client = anthropic.Anthropic()

    print(f"Caso {case.name} · modelo {args.model} · effort {args.effort} · brain {bundle.version}")
    if args.count_only:
        print(f"Tokens de entrada: {count_tokens(client, request):,}")
        return 0

    started = time.monotonic()
    try:
        completion = complete(client, request)
    except anthropic.APIConnectionError:
        print("Error: no hay conexión con la API.", file=sys.stderr)
        return 1
    except anthropic.APIStatusError as error:
        print(f"Error de la API ({error.status_code}): {error.message}", file=sys.stderr)
        return 1
    elapsed = time.monotonic() - started

    record: dict[str, object] = {
        "case": case.name,
        "prompt_version": PROMPT_VERSION,
        "brain_version": bundle.version,
        "model_requested": args.model,
        "model_served": completion.model,
        "effort": args.effort,
        "stop_reason": completion.stop_reason,
        "usage": completion.usage,
        "elapsed_s": round(elapsed, 1),
    }
    status = 0
    try:
        analysis = parse(completion)
        record["analysis"] = analysis.model_dump(by_alias=True)
        record["unknown_links"] = unknown_links(analysis, bundle.pages)
    except BrainError as error:
        record["error"] = str(error)
        record["raw_text"] = completion.text
        status = 1

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    target = out / f"{case.stem}-{args.model}-{stamp}.json"
    target.write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding="utf-8")

    usage = completion.usage
    print(
        f"Servido por {completion.model} en {elapsed:.0f} s · stop_reason {completion.stop_reason}"
    )
    print(
        f"Tokens: {usage['input_tokens']} entrada · {usage['cache_creation_input_tokens']} "
        f"escritos en caché · {usage['cache_read_input_tokens']} leídos de caché · "
        f"{usage['output_tokens']} salida"
    )
    if "error" in record:
        print(f"Error: {record['error']}", file=sys.stderr)
    else:
        print(f"Cambios propuestos: {len(record['analysis']['changes'])}")  # type: ignore[index]
        if record["unknown_links"]:
            print(f"Citas que no están en el brain: {record['unknown_links']}")
    print(f"Guardado en {target}")
    return status


def summary(args: argparse.Namespace) -> int:
    """Arma el JSON de entrada con los datos reales de un usuario, para pasárselo a analyze."""
    with Session(get_engine()) as db:
        user = db.scalar(select(AppUser).where(AppUser.email == args.email))
        if user is None:
            print(f"No existe el usuario {args.email}", file=sys.stderr)
            return 1
        today = date.today()
        window = weeks_window(today, args.weeks, f"últimas {args.weeks} semanas")
        data, _ = build_summary(db, user, window, today)
    text = json.dumps(data, ensure_ascii=False, indent=1)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"Guardado en {args.out}")
    else:
        print(text)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.brain.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    build = commands.add_parser("summary", help="Arma el JSON de entrada con datos reales")
    build.add_argument("email")
    build.add_argument("--weeks", type=int, default=4)
    build.add_argument("--out", help="Archivo de salida; sin esto, va a la pantalla")
    run = commands.add_parser("analyze", help="Corre un caso de prueba contra la API")
    run.add_argument("input", help="JSON de entrada (formato de la sección 5 del diseño)")
    run.add_argument("--bundle", default="/brain/out/latest.json")
    run.add_argument("--model", default=os.environ.get("BRAIN_MODEL") or DEFAULT_MODEL)
    run.add_argument(
        "--effort", default=DEFAULT_EFFORT, choices=["low", "medium", "high", "xhigh", "max"]
    )
    run.add_argument("--count-only", action="store_true", help="Solo cuenta tokens, sin gastar")
    run.add_argument("--out", default="/brain/cases/resultados")
    args = parser.parse_args(argv)
    return summary(args) if args.command == "summary" else analyze(args)


if __name__ == "__main__":
    sys.exit(main())
