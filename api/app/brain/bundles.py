"""El bundle del brain en la base: lo sube upload-bundle y lo usa cada análisis."""

import json
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import BrainBundle


def register_bundle(db: Session, manifest_path: Path) -> BrainBundle:
    """Guarda el bundle que dejó brain/build_bundle.py (latest.json y sus dos archivos).
    Subir otra vez la misma versión la reemplaza."""
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    folder = manifest_path.parent
    pages = json.loads((folder / manifest["pages"]).read_text(encoding="utf-8"))
    bundle = db.get(BrainBundle, manifest["version"]) or BrainBundle(version=manifest["version"])
    bundle.built_at = datetime.fromisoformat(manifest["built_at"])
    bundle.bytes = manifest.get("bytes")
    bundle.estimated_tokens = manifest.get("estimated_tokens")
    bundle.pages_json = sorted(page["name"] for page in pages)
    bundle.content = (folder / manifest["bundle"]).read_text(encoding="utf-8")
    db.add(bundle)
    db.commit()
    return bundle


def latest_bundle(db: Session) -> BrainBundle | None:
    """El último que se subió: es el que usan los análisis nuevos."""
    return db.scalar(select(BrainBundle).order_by(BrainBundle.uploaded_at.desc()).limit(1))
