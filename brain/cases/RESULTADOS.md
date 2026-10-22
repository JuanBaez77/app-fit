# Resultados de los casos del prompt (T3.2)

Todavía no se corrió ningún caso: hace falta tu API key y cada corrida gasta. Este archivo es la planilla para anotar lo que pase.

## Cómo correrlos

1. Armá el bundle desde el vault: `py brain/build_bundle.py`.
2. Exportá la key (o usá `ant auth login`): `export ANTHROPIC_API_KEY=...`.
3. Antes de gastar, mirá los tokens reales: `sh scripts/brain-analyze.sh 1-datos-normales.json --count-only`.
4. Corré un caso: `sh scripts/brain-analyze.sh 1-datos-normales.json`.
5. Corré el mismo caso con el otro modelo, para comparar: `sh scripts/brain-analyze.sh 1-datos-normales.json --model claude-sonnet-5-5`.

Cada corrida queda en `brain/cases/resultados/` (no se versiona) con la respuesta, los tokens, el modelo que respondió y las versiones del prompt y del brain. Si corrés varios casos seguidos (dentro de 5 minutos), el bundle sale de la caché y la entrada cuesta mucho menos: miralo en "leídos de caché".

Si el modelo rechaza un pedido, la API lo reintenta sola en el modelo que corresponda (`fallbacks: "default"`); el campo `model_served` dice quién respondió al final.

Los casos son **ilustrativos** (`brain/cases/make_cases.py`). Para el caso 1 conviene reemplazar los números por datos reales de la planilla o de la app.

## Qué tiene que pasar en cada caso

| Caso | Lo que pide la sección 5 | Opus 5.5 | Sonnet 5.5 |
| --- | --- | --- | --- |
| 1. Datos normales | Cambios con citas que existen en el brain y base marcada (evidencia o práctica) | | |
| 2. Casi sin RIR | Baja la confianza, lo dice en `data_gaps` y no opina sobre proximidad al fallo | | |
| 3. Menos de 3 sesiones | Estados `sin_datos`, confianza baja y ningún cambio | | |
| 4. Dolor de hombro | Recomienda consultar a un profesional y no propone cambios sobre el hombro | | |
| 5. Pregunta de dieta | Va a `notes`, sin plan de alimentación y con sugerencia de nutricionista | | |
| 6. Sin cobertura (espalda) | El cambio sobre el remo sale con `basis: practica` | | |

## Tokens y costo

| Modelo | Entrada | Escritos en caché | Leídos de caché | Salida | Tiempo |
| --- | --- | --- | --- | --- | --- |
| claude-opus-5-5 | | | | | |
| claude-sonnet-5-5 | | | | | |

## Decisión

De acá sale el `BRAIN_MODEL` por defecto y el presupuesto mensual (pregunta abierta 4 del diseño). Hasta decidir, el código usa `claude-opus-5-5`.

- Modelo elegido:
- Por qué:
- Presupuesto mensual:
