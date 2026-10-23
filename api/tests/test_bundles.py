import json
from pathlib import Path

from sqlalchemy.orm import Session

from app.brain.bundles import latest_bundle, register_bundle


def write_bundle(folder: Path, version: str, built_at: str, pages: list[str]) -> Path:
    (folder / f"bundle-{version}.xml").write_text(f'<brain version="{version}"/>', encoding="utf-8")
    (folder / f"pages-{version}.json").write_text(
        json.dumps([{"name": name, "path": f"wiki/{name}.md"} for name in pages]),
        encoding="utf-8",
    )
    manifest = folder / "latest.json"
    manifest.write_text(
        json.dumps(
            {
                "version": version,
                "built_at": built_at,
                "bundle": f"bundle-{version}.xml",
                "pages": f"pages-{version}.json",
                "bytes": 1234,
                "estimated_tokens": 300,
            }
        ),
        encoding="utf-8",
    )
    return manifest


def test_registra_el_bundle_con_sus_paginas(db: Session, tmp_path: Path) -> None:
    manifest = write_bundle(tmp_path, "abc1234", "2026-10-22T08:00:00+00:00", ["volumen", "rir"])

    bundle = register_bundle(db, manifest)

    assert bundle.version == "abc1234"
    assert bundle.pages_json == ["rir", "volumen"]
    assert bundle.content == '<brain version="abc1234"/>'
    assert bundle.estimated_tokens == 300


def test_subir_la_misma_version_la_reemplaza(db: Session, tmp_path: Path) -> None:
    register_bundle(db, write_bundle(tmp_path, "abc1234", "2026-10-22T08:00:00+00:00", ["a"]))

    bundle = register_bundle(
        db, write_bundle(tmp_path, "abc1234", "2026-10-22T09:00:00+00:00", ["a", "b"])
    )

    assert bundle.pages_json == ["a", "b"]
    assert latest_bundle(db) is bundle


def test_sin_bundles_no_hay_ultimo(db: Session) -> None:
    assert latest_bundle(db) is None
