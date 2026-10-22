# brain/

Herramientas que corren en tu PC contra el vault `C:\second-brain`. No se despliegan.

## Bundle

```bash
py brain/build_bundle.py               # usa BRAIN_VAULT o C:\second-brain
py brain/build_bundle.py D:\otro-vault --out brain/out
```

Arma el texto que la API le pasa a Claude como contexto:

- **Qué va:**
  - las reglas de `CLAUDE.md` que le sirven a un modelo sin acceso a archivos: §5 (jerarquía de evidencia), §6.7 (ajuste) y §10 (reglas inquebrantables);
  - `index.md`;
  - las páginas de `wiki/{conceptos,musculos,ejercicios,splits,claims}`.
- **Qué no va:**
  - `wiki/estudios/` va solo por nombre, en la lista de páginas citables;
  - `personas/` y `rutinas/` no van, porque el perfil y la rutina los manda la app.
- **De dónde lee:** del último commit, con `git`, no recorriendo carpetas. El vault tiene copias de la wiki en `.claude/worktrees/` que duplicarían páginas. Si hay cambios sin commitear en `wiki/`, `index.md` o `CLAUDE.md`, falla (`--allow-dirty` para seguir igual).
- **Qué deja en `brain/out/`** (no se versiona):
  - `bundle-<commit>.xml`;
  - `pages-<commit>.json`, las páginas citables, contra las que se validan las citas del brain;
  - `latest.json`, el manifiesto.
- **Esquema:** avisa si la versión del esquema de `CLAUDE.md` deja de ser la 6, para que revises el prompt.

Tokens: muestra una estimación por bytes. El número real: `sh scripts/brain-analyze.sh CASO.json --count-only` (no gasta).

Tests: `py -m unittest discover -s brain/tests` (los corre el hook pre-push).

## Casos del prompt (PR-17)

`cases/` tiene los 6 casos de la sección 5 del diseño (números ilustrativos, `make_cases.py` los regenera) y `RESULTADOS.md` para anotar qué hizo cada modelo. Se corren con `sh scripts/brain-analyze.sh CASO.json`, que llama a la API desde el contenedor de la api con el bundle de `out/`. El prompt y el esquema de salida viven en `api/app/brain/`, para que la app use exactamente lo mismo (PR-26).
