"""Arma el bundle del brain: el texto que la API le pasa a Claude como contexto.

    py brain/build_bundle.py [VAULT] [--out brain/out] [--allow-dirty]

VAULT es el repo del brain (por defecto BRAIN_VAULT o C:\\second-brain). Lee los archivos del
commit HEAD con git, nunca recorriendo carpetas: el vault tiene copias de la wiki en
.claude/worktrees/ que duplicarían páginas. Solo usa la biblioteca estándar.

Deja en --out:
  bundle-<version>.xml   reglas del brain + páginas, una <page path="..."> por archivo
  pages-<version>.json   páginas citables (incluidos los estudios, que no van enteros)
  latest.json            versión, archivos, tamaño y tokens estimados
"""

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

# Páginas que van enteras. estudios/ va solo por nombre (index.md da una línea de cada uno);
# personas/ y rutinas/ no van: el perfil y la rutina los manda la app.
INCLUDED_FOLDERS = ("conceptos", "musculos", "ejercicios", "splits", "claims")
CITABLE_ONLY_FOLDERS = ("estudios",)
# Reglas de CLAUDE.md que le sirven a un modelo sin acceso a archivos:
# jerarquía de evidencia, flujo de ajuste y reglas inquebrantables
RULE_SECTIONS = ("5", "6.7", "10")
EXPECTED_SCHEMA_VERSION = 6
# Estimación gruesa para texto en español; el número real lo da la API (PR-17)
BYTES_PER_TOKEN = 3.6


class BundleError(Exception):
    pass


@dataclass
class Bundle:
    version: str
    commit_date: str
    schema_version: int | None
    xml: str
    pages: list[dict[str, str | bool]]

    @property
    def bytes(self) -> int:
        return len(self.xml.encode("utf-8"))

    @property
    def estimated_tokens(self) -> int:
        return round(self.bytes / BYTES_PER_TOKEN)


def git(vault: Path, *args: str) -> str:
    result = subprocess.run(["git", "-C", str(vault), *args], capture_output=True, check=False)
    if result.returncode != 0:
        raise BundleError(f"git {' '.join(args)}: {result.stderr.decode(errors='replace').strip()}")
    return result.stdout.decode("utf-8")


def read_at_head(vault: Path, path: str) -> str:
    return git(vault, "show", f"HEAD:{path}")


def tracked(vault: Path, folder: str) -> list[str]:
    files = git(vault, "ls-files", "-z", "--", folder).split("\0")
    return sorted(f for f in files if f.endswith(".md"))


def extract_sections(markdown: str, numbers: tuple[str, ...]) -> str:
    """Devuelve las secciones numeradas pedidas (## 5. o ### 6.7) con sus subsecciones.

    Ignora los encabezados dentro de bloques de código.
    """
    heading = re.compile(r"^(#{2,3}) (\d+(?:\.\d+)?)[.\s]")
    chunks: list[str] = []
    current: list[str] | None = None
    current_level = 0
    in_fence = False
    for line in markdown.splitlines():
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
        match = None if in_fence else heading.match(line)
        if match:
            level = len(match.group(1))
            if current is not None and level <= current_level:
                chunks.append("\n".join(current).strip())
                current = None
            if match.group(2) in numbers:
                current, current_level = [], level
        if current is not None:
            current.append(line)
    if current is not None:
        chunks.append("\n".join(current).strip())
    found = {heading.match(c).group(2) for c in chunks}  # type: ignore[union-attr]
    missing = [n for n in numbers if n not in found]
    if missing:
        raise BundleError(f"CLAUDE.md no tiene las secciones {', '.join(missing)}")
    return "\n\n".join(chunks)


def schema_version(claude_md: str) -> int | None:
    match = re.search(r"Versión del esquema:\s*(\d+)", claude_md)
    return int(match.group(1)) if match else None


def build(vault: Path, allow_dirty: bool = False) -> Bundle:
    if not allow_dirty:
        dirty = git(vault, "status", "--porcelain", "--", "wiki", "index.md", "CLAUDE.md")
        if dirty.strip():
            raise BundleError(
                "El vault tiene cambios sin commitear en wiki/, index.md o CLAUDE.md. "
                "El bundle se arma desde el último commit: commiteá primero (o --allow-dirty)."
            )

    version = git(vault, "rev-parse", "--short", "HEAD").strip()
    commit_date = git(vault, "log", "-1", "--format=%cI").strip()
    claude_md = read_at_head(vault, "CLAUDE.md")

    pages: list[dict[str, str | bool]] = []
    parts = [
        f'<brain version="{version}" commit_date="{commit_date}">',
        "<rules>",
        extract_sections(claude_md, RULE_SECTIONS),
        "</rules>",
        f'<page path="index.md">\n{read_at_head(vault, "index.md").strip()}\n</page>',
    ]
    for folder in INCLUDED_FOLDERS + CITABLE_ONLY_FOLDERS:
        included = folder in INCLUDED_FOLDERS
        for path in tracked(vault, f"wiki/{folder}"):
            pages.append({"name": Path(path).stem, "folder": folder, "included": included})
            if included:
                parts.append(f'<page path="{path}">\n{read_at_head(vault, path).strip()}\n</page>')
    parts.append("</brain>")

    return Bundle(
        version=version,
        commit_date=commit_date,
        schema_version=schema_version(claude_md),
        xml="\n".join(parts) + "\n",
        pages=pages,
    )


def write(bundle: Bundle, out: Path) -> Path:
    out.mkdir(parents=True, exist_ok=True)
    bundle_file = out / f"bundle-{bundle.version}.xml"
    pages_file = out / f"pages-{bundle.version}.json"
    bundle_file.write_text(bundle.xml, encoding="utf-8")
    pages_file.write_text(json.dumps(bundle.pages, ensure_ascii=False, indent=1), encoding="utf-8")
    manifest = {
        "version": bundle.version,
        "commit_date": bundle.commit_date,
        "schema_version": bundle.schema_version,
        "built_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "bundle": bundle_file.name,
        "pages": pages_file.name,
        "bytes": bundle.bytes,
        "estimated_tokens": bundle.estimated_tokens,
        "included_pages": sum(1 for p in bundle.pages if p["included"]),
        "citable_pages": len(bundle.pages),
    }
    manifest_file = out / "latest.json"
    manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    return manifest_file


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "vault", nargs="?", default=os.environ.get("BRAIN_VAULT", r"C:\second-brain")
    )
    parser.add_argument("--out", default=str(Path(__file__).parent / "out"))
    parser.add_argument("--allow-dirty", action="store_true")
    args = parser.parse_args(argv)
    # La consola de Windows no usa UTF-8 por defecto
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")

    try:
        bundle = build(Path(args.vault), allow_dirty=args.allow_dirty)
    except BundleError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    manifest = write(bundle, Path(args.out))
    included = sum(1 for p in bundle.pages if p["included"])
    print(f"Bundle {bundle.version} ({bundle.commit_date})")
    print(f"  {included} páginas enteras, {len(bundle.pages)} citables")
    print(f"  {bundle.bytes / 1024:.0f} KB, ~{bundle.estimated_tokens:,} tokens (estimado)")
    print(f"  {manifest}")
    if bundle.schema_version != EXPECTED_SCHEMA_VERSION:
        print(
            f"Aviso: CLAUDE.md está en la versión {bundle.schema_version} del esquema y el prompt "
            f"se escribió para la {EXPECTED_SCHEMA_VERSION}. Revisá el prompt antes de usarlo.",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
