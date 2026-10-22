"""py -m unittest discover -s brain/tests"""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import build_bundle

CLAUDE_MD = """# CLAUDE.md

## 4. Formatos
Nada.

## 5. Jerarquía de evidencia
Nivel 1: metaanálisis.

## 6. Operaciones
### 6.1 INGEST
No va.
### 6.7 AJUSTE
Cambiá lo mínimo.

## 9. Archivos
```
## 10. esto es un ejemplo dentro de un bloque de código
```

## 10. Reglas inquebrantables
Nada inventado.

## 11. Búsqueda
No va.

`Versión del esquema: 6 · Última revisión: 2026-10-21`
"""


class VaultTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.vault = Path(self.tmp.name) / "vault"
        self.out = Path(self.tmp.name) / "out"
        files = {
            "CLAUDE.md": CLAUDE_MD,
            "index.md": "# Índice\n- [[larsen-2025]]: laterales en entrenados\n",
            "wiki/conceptos/volumen.md": "# Volumen\n",
            "wiki/claims/series-indirectas.md": "# Series indirectas\n",
            "wiki/ejercicios/press-de-banca.md": "# Press de banca\n",
            "wiki/estudios/larsen-2025.md": "# Larsen 2025\nTexto largo del estudio.\n",
            "personas/juan.md": "# Juan\n",
            "rutinas/juan/rutina.md": "# Rutina\n",
        }
        for path, text in files.items():
            target = self.vault / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding="utf-8")
        self.git("init", "-q")
        self.git("add", ".")
        self.git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "inicial")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def git(self, *args: str) -> None:
        subprocess.run(["git", "-C", str(self.vault), *args], check=True, capture_output=True)

    def test_incluye_las_paginas_y_las_reglas(self) -> None:
        bundle = build_bundle.build(self.vault)

        self.assertIn('<page path="wiki/conceptos/volumen.md">', bundle.xml)
        self.assertIn('<page path="index.md">', bundle.xml)
        self.assertIn("Nivel 1: metaanálisis.", bundle.xml)
        self.assertIn("Cambiá lo mínimo.", bundle.xml)
        self.assertIn("Nada inventado.", bundle.xml)
        self.assertEqual(bundle.schema_version, 6)

    def test_deja_afuera_lo_que_no_va(self) -> None:
        bundle = build_bundle.build(self.vault)

        for text in ("No va.", "Texto largo del estudio.", "# Juan", "# Rutina", "## 4. Formatos"):
            self.assertNotIn(text, bundle.xml)

    def test_los_encabezados_dentro_de_codigo_no_cortan_secciones(self) -> None:
        rules = build_bundle.extract_sections(CLAUDE_MD, ("10",))

        self.assertTrue(rules.startswith("## 10. Reglas inquebrantables"))
        self.assertNotIn("ejemplo dentro", rules)

    def test_los_estudios_son_citables_aunque_no_vayan_enteros(self) -> None:
        pages = {p["name"]: p for p in build_bundle.build(self.vault).pages}

        self.assertEqual(
            pages["larsen-2025"], {"name": "larsen-2025", "folder": "estudios", "included": False}
        )
        self.assertTrue(pages["press-de-banca"]["included"])

    def test_ignora_archivos_sin_commitear_como_las_copias_de_worktrees(self) -> None:
        copy = self.vault / ".claude/worktrees/x/wiki/conceptos/volumen.md"
        copy.parent.mkdir(parents=True)
        copy.write_text("# Copia\n", encoding="utf-8")

        bundle = build_bundle.build(self.vault)

        self.assertEqual(bundle.xml.count('path="wiki/conceptos/volumen.md"'), 1)
        self.assertNotIn("# Copia", bundle.xml)

    def test_falla_con_cambios_sin_commitear(self) -> None:
        (self.vault / "wiki/conceptos/volumen.md").write_text("# Cambio\n", encoding="utf-8")

        with self.assertRaises(build_bundle.BundleError):
            build_bundle.build(self.vault)
        # Con --allow-dirty lee igual el último commit, no el cambio
        self.assertNotIn("# Cambio", build_bundle.build(self.vault, allow_dirty=True).xml)

    def test_la_version_es_el_commit(self) -> None:
        head = subprocess.run(
            ["git", "-C", str(self.vault), "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()

        self.assertEqual(build_bundle.build(self.vault).version, head)

    def test_escribe_bundle_paginas_y_manifiesto(self) -> None:
        bundle = build_bundle.build(self.vault)
        manifest_file = build_bundle.write(bundle, self.out)

        manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
        self.assertEqual(manifest["version"], bundle.version)
        self.assertEqual(manifest["citable_pages"], 4)
        self.assertEqual(manifest["included_pages"], 3)
        self.assertTrue((self.out / manifest["bundle"]).exists())
        self.assertTrue((self.out / manifest["pages"]).exists())

    def test_falta_una_seccion(self) -> None:
        with self.assertRaises(build_bundle.BundleError):
            build_bundle.extract_sections("## 5. Algo\n", ("5", "10"))


if __name__ == "__main__":
    unittest.main()
