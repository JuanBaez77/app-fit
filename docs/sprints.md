# app-fit — sprints y PRs del MVP

Sale de [diseno-resumen.md](diseno-resumen.md) y [diseno-completo.md](diseno-completo.md). Fecha: 2026-10-22.

## Cómo está armado

- **Sprints de 1 semana a ~15 h** (el supuesto del diseño). Las fechas son de referencia: un sprint cierra con su prueba, no con el calendario.
- **1 PR = 1 tarea del diseño (T#)**, de 2 a 6 h. Los PR van numerados en orden de merge.
- Las 5 etapas del diseño quedan en 10 sprints. Uno más que la cuenta pura de horas, porque la etapa 1 pide **una semana de uso real** antes de seguir. Esa semana se aprovecha para la pista paralela del brain (probar el prompt), que no depende de la app.
- Total: **~135 h** (los ~121 h del diseño + CI, buffers para arreglos de uso real, el cálculo de métricas en Python y la pantalla de ajustes; ver "Ajustes al diseño").

| Sprint | Semana | Etapa | PRs | Horas | Prueba de cierre |
| --- | --- | --- | --- | --- | --- |
| S0 Cimientos | 26 oct | 0 | PR-01 a PR-05 | 14 | PWA instalada en el celular y login con tu contraseña |
| S1 Datos y sync | 2 nov | 1 (+ brain) | PR-06 a PR-09 | 16 | `pull` devuelve la rutina v1 y el catálogo; el bundle se genera |
| S2 Cliente offline | 9 nov | 1 | PR-10 a PR-12 | 13 | Empezás la sesión del día en modo avión y ves "última vez" |
| S3 La serie en 5 s | 16 nov | 1 | PR-13 a PR-15 | 12 | Sesión completa en el gimnasio, sin señal |
| S4 Semana de uso + prompt | 23 nov | 1 (+ brain) | PR-16, PR-17 | 11 | **Cierre etapa 1:** una semana sin perder series; los 6 casos del prompt corridos |
| S5 Calendario y progreso | 30 nov | 2 | PR-18 a PR-20 | 15 | Calendario y gráfico por ejercicio funcionan sin red |
| S6 Músculos, peso y rutina | 7 dic | 2 | PR-21 a PR-24 | 15 | **Cierre etapa 2:** el volumen semanal coincide con la tabla de la rutina |
| S7 Brain: backend | 14 dic | 3 | PR-25, PR-26 | 15 | Un análisis por API con tus datos queda guardado y validado |
| S8 Brain: pantallas | 21 dic | 3 | PR-27 a PR-29 | 14 | **Cierre etapa 3:** aceptás un cambio y queda una rutina versionada |
| S9 Uso real y ajuste | 4 ene + 2 sem | 4 | PR-30 a PR-32 | 10 | **Cierre MVP:** mediana de `interaction_ms` ≤ 5 s |

La revisión de la rutina del **17 nov** cae en S3 y no depende de la app: se hace como hoy, por chat con el brain y con la planilla. S8 cae en las fiestas; si se corre, se corre.

## Reglas para cada PR

- Rama desde `main` con nombre `tipo/descripcion` (`feat/`, `fix/`, `chore/`, `ops/`, `perf/`); squash merge.
- La descripción lleva: tarea (T#), historias (US-#), cómo probarlo y captura si toca pantalla.
- **Listo para mergear** cuando:
  - el CI está verde y lo nuevo tiene tests;
  - si hay migración, también baja (`alembic downgrade -1`);
  - si toca el registro, se probó en modo avión;
  - si toca una pantalla de registro, se probó en tu celular;
  - no hay secretos en el repo (`.env` fuera, `.env.example` adentro).
- Si un PR pasa de ~400 líneas (sin lockfiles ni código generado), se parte.

## Decisiones que bloquean

| Antes de | Decisión |
| --- | --- |
| S0 | Subdominio, si el VPS ya tiene un Postgres para reusar, nombre del repo en GitHub |
| S1 | Confirmar el equipamiento (pregunta abierta 3): define el catálogo que se siembra. Confirmar que la app pasa a ser la fuente de verdad de la rutina (pregunta 5) |
| S4 | API key de Anthropic con un tope de gasto |
| S7 | `BRAIN_MODEL` por defecto y presupuesto mensual (pregunta 4), con los tokens reales que dé PR-17 |
| S7 | Si las molestias viajan a la API (pregunta 2), después de revisar los términos de uso de datos |

La pregunta 1 (multiusuario) no bloquea: se asume uso personal con `user_id` en las tablas.

## Ajustes al diseño

Seis cosas que aparecieron al bajar el diseño a PRs. Ya están incorporadas a los PR de abajo.

1. **El cursor de sincronización tiene que ser del servidor.** Si `pull` filtra por el `updated_at` que pone el cliente, una serie cargada offline y subida tarde puede quedar con fecha anterior al último cursor, y otro dispositivo no la recibe nunca. Se agrega `synced_at timestamptz` en las tablas que se sincronizan: lo pone el servidor en cada escritura y `pull` filtra por esa columna. `updated_at` sigue decidiendo quién gana (PR-06, PR-08).
2. **Aceptar cambios de a uno necesita linaje.** Cada versión de la rutina clona sus filas con ids nuevos. Al aceptar el cambio 1 nace la v2, y el cambio 2 todavía apunta a ids de la v1. Se agrega `cloned_from_id` en `routine_day` y `routine_day_exercise`: al aceptar, el target se busca en la versión vigente siguiendo ese linaje y el valor `from` se compara con el actual. Si no coincide, el cambio pasa a `obsoleto` (PR-06, PR-24, PR-28).
3. **Las métricas viven en dos lados.** Calendario y progreso tienen que andar sin red, así que se calculan en el cliente (TS). El análisis las arma en el servidor (Python). Para que no diverjan, hay **fixtures dorados compartidos** (`fixtures/metrics/*.json`) que corren las dos suites de tests. Portarlas a Python suma unas 3 h que el diseño no tenía (PR-18, PR-25).
4. **El perfil y los ajustes no tenían tarea.** Se siembra `user_profile` desde `personas/juan` en PR-07, con el paso de peso de 2,5 kg, porque PR-13 lo necesita. La pantalla de ajustes (paso de peso, fase, opt-in de molestias) llega en PR-23. La fase de definición termina a principios de diciembre, así que hace falta poder cambiarla.
5. **El bundle se lee desde git, no recorriendo carpetas.** El vault tiene copias de la wiki dentro de `.claude/worktrees/`, que duplicarían páginas. El script usa `git ls-files` sobre el commit, y ese hash es el `brain_version` (PR-09).
6. **Hay una rutina v2 sin mergear en el vault** (`rutina-2026-10-21.md`, en la rama `claude/second-brain-remaining-tasks-c1648f`). Según el propio archivo, el entrenamiento es igual al de la v1 y solo actualiza la evidencia sobre proteína. Importar la v1 sirve igual; conviene mergear o descartar esa rama antes de PR-07 para no tener dos versiones dando vueltas.

---

## S0 — Cimientos (≈14 h)

**Objetivo:** la PWA vacía, instalada en el celular, con login contra el API desplegado en el VPS.

#### PR-01 · `chore/monorepo` · T0.1 · 3 h
- [ ] `git init`, repo privado en GitHub, `main` protegida.
- [ ] Carpetas `api/`, `web/`, `brain/`, `docs/` (los dos `.md` de diseño y este plan pasan a `docs/`).
- [ ] `docker-compose.yml` de desarrollo con `db` (PostgreSQL), `api` y `nginx`.
- [ ] `Makefile` con `up`, `down`, `migrate`, `test`, `lint`, `fmt`.
- [ ] Linters: ruff y mypy en `api/`; eslint, prettier y `tsc` en `web/`.
- [ ] CI en GitHub Actions: lint y tests de `api/` y `web/` en cada PR (+1 h, no estaba en el diseño).
- [ ] `.env.example`, `.gitignore` y un README con cómo levantar todo.

**Listo cuando:** `make up` levanta los tres servicios y el CI pasa en un PR vacío.

#### PR-02 · `feat/api-base` · T0.2 · 2 h
- [ ] FastAPI con configuración por `pydantic-settings`, SQLAlchemy 2 y psycopg 3.
- [ ] Alembic. Migración `0001`: `app_user` y `muscle`, con la semilla de los 12 músculos (`recto_femoral` → `cuadriceps` como padre).
- [ ] `GET /health`, que verifica la conexión a la base.
- [ ] pytest contra un Postgres de test, con una transacción por test.

**Listo cuando:** `make migrate` crea las tablas y el test de `/health` pasa.

#### PR-03 · `feat/api-auth` · T0.3 · 3 h
- [ ] Hash con argon2. Comando `create-user` (no hay registro público).
- [ ] `POST /auth/login`: token de acceso corto y refresh en cookie `httpOnly`, `Secure`, `SameSite=Strict`.
- [ ] `POST /auth/refresh` con rotación del refresh; `POST /auth/logout`.
- [ ] `GET /me`.
- [ ] Límite simple de intentos de login.
- [ ] Tests: login correcto e incorrecto, refresh, token vencido, `/me` sin token devuelve 401.

**Listo cuando:** los tests pasan y el refresh rota.

#### PR-04 · `feat/web-shell` · T0.4 · 3 h
- [ ] Vite, React y TypeScript; `vite-plugin-pwa` con manifest, íconos 192/512, `apple-touch-icon` y `display: standalone`.
- [ ] Router y barra inferior con Hoy, Calendario, Progreso y Análisis (vacías).
- [ ] Pantalla de login. Cliente HTTP con el token de acceso en memoria y refresh automático ante un 401.
- [ ] Base visual: contraste alto (a pleno sol) y áreas táctiles de 48 px o más.
- [ ] vitest y Testing Library configurados.

**Listo cuando:** Chrome la marca como instalable y el login anda contra el API local.

#### PR-05 · `ops/deploy-vps` · T0.5 · 3 h
- [ ] `docker-compose.prod.yml`: api (gunicorn con workers uvicorn), nginx que sirve `web/dist` y hace proxy de `/api`, y Postgres con volumen (o una base nueva en el Postgres que ya tengas).
- [ ] HTTPS en el subdominio.
- [ ] Cron diario de `pg_dump` con rotación (por ejemplo, 14 copias). Si se puede, una copia fuera del VPS.
- [ ] `make deploy`, que corre las migraciones al desplegar.
- [ ] Crear tu usuario en producción con `create-user`.

**Listo cuando:** `https://<subdominio>/api/health` responde y existe el dump del día.

**Cierre S0:** instalás la PWA en tu celular y entrás con tu contraseña.

---

## S1 — Datos de rutina y sincronización (≈16 h)

**Objetivo:** el servidor tiene el catálogo y la rutina v1 y sabe sincronizar. Arranca la pista del brain.

#### PR-06 · `feat/api-schema-registro` · T1.1 · 3 h
- [ ] Migración: `user_profile`, `exercise`, `exercise_muscle`, `routine` (con el índice `one_current`), `routine_day`, `routine_day_exercise`, `routine_muscle_target`, `session`, `set_log` (con `set_by_exercise`) y `body_weight` (con `one_weight_per_day`).
- [ ] `synced_at` en las tablas que se sincronizan (ajuste 1).
- [ ] `cloned_from_id` en `routine_day` y `routine_day_exercise` (ajuste 2).
- [ ] Modelos SQLAlchemy y esquemas Pydantic.
- [ ] `brain_bundle`, `analysis`, `analysis_change` y la FK circular quedan para PR-26.

**Listo cuando:** la migración sube y baja limpia.

#### PR-07 · `feat/seed-catalogo-rutina` · T1.2 · 4 h · US-01, US-03
- [ ] `api/seeds/catalogo.yaml`: los ejercicios de la rutina, con `kind`, `brain_page`, `e1rm_eligible` y los factores del mapa de la sección 3. Las excepciones son filas que faltan: el press de banca no cuenta para el deltoides lateral, y la prensa y la sentadilla no cuentan para el recto femoral.
- [ ] `api/seeds/rutina-2026-10-20.yaml`, transcripta a mano desde el `.md` (es una sola vez, no vale la pena parsear markdown):
  - los 5 días: lunes Torso, martes Pierna A, miércoles Empuje, jueves Tirón y viernes Pierna B;
  - por ejercicio: series, repeticiones, RIR, descanso y `ramp_sets`/`ramp_weeks`;
  - la tabla de objetivos por músculo;
  - `start_on` 2026-10-20 y `review_on` 2026-11-17.
- [ ] Semilla de `user_profile` desde `personas/juan`, sin nombre ni correo, con `weight_step_kg` 2,5 y `send_discomfort_to_ai` en falso (ajuste 4).
- [ ] `POST /routines/import`: crea la v1 (`source = importada`) solo si no hay ninguna rutina.
- [ ] Test: importar dos veces no duplica nada.

**Listo cuando:** después de importar, la base tiene la v1 vigente con sus 5 días y sus objetivos.

#### PR-08 · `feat/api-sync` · T1.3 · 5 h · US-10
- [ ] `POST /sync/push`: lote de filas por tabla (`session`, `set_log`, `body_weight`, `exercise` con sus músculos). Upsert por `id`; gana el `updated_at` más nuevo; borrado lógico con `deleted_at`. El servidor pone `synced_at`.
- [ ] `GET /sync/pull?since=`: todo lo que tenga `synced_at` posterior al cursor, más la rutina vigente con sus hijos y el catálogo. Devuelve el próximo cursor (hora del servidor).
- [ ] El `user_id` sale del token, nunca del cuerpo del pedido.
- [ ] Tests:
  - reenviar el mismo lote no duplica;
  - una fila vieja no pisa a una nueva;
  - un borrado lógico viaja en el `pull`;
  - una serie subida tarde aparece en el `pull` de otro dispositivo.

**Listo cuando:** pasan los cuatro tests.

#### PR-09 · `feat/brain-bundle` · T3.1 · 4 h · pista paralela
- [ ] `brain/build_bundle.py <ruta-del-vault>`, que lee con `git ls-files` sobre `HEAD` (ajuste 5) y falla si el vault tiene cambios sin commitear.
- [ ] Incluye `wiki/{conceptos,musculos,ejercicios,splits,claims}`, `index.md` y las secciones §5, §6.7 y §10 de `CLAUDE.md`. Excluye `estudios/`, `personas/`, `rutinas/` y `raw/`.
- [ ] Genera tres cosas:
  - `bundle-<hash>.xml`, con `<brain version>` y un `<page path>` por página;
  - `pages.json`, la lista de páginas citables;
  - el tamaño en bytes.
- [ ] Con `--count-tokens`, pide el número real al endpoint de conteo de tokens de la API.
- [ ] Avisa si cambió la versión del esquema de `CLAUDE.md` (hoy es la 6).

**Listo cuando:** genera el bundle y su tamaño ronda lo estimado (~171 KB).

**Cierre S1:** un `pull` con tu token devuelve la rutina v1 y el catálogo, y el bundle existe.

---

## S2 — Registro offline: el cliente (≈13 h)

**Objetivo:** en modo avión, la app abre la sesión del día y muestra cada ejercicio con su historia.

#### PR-10 · `feat/web-dexie-sync` · T1.4 · 5 h · US-10
- [ ] Dexie con tablas espejo, `outbox` (la cola de operaciones) y `meta` (el cursor).
- [ ] Cada escritura guarda la fila y la encola en una sola transacción de Dexie, antes de mostrar la confirmación.
- [ ] Ids UUID v7 generados en el cliente.
- [ ] Sincronizador:
  - sube la `outbox` por lotes y después baja los cambios;
  - reintenta con backoff;
  - corre al abrir la app, al volver la conexión y cada pocos minutos con la app abierta.
- [ ] `navigator.storage.persist()` al iniciar (riesgo de iOS).
- [ ] Indicador discreto de series pendientes de sincronizar.
- [ ] Test: si la subida se corta a mitad de camino y se reintenta, no hay duplicados.

**Listo cuando:** pasa el test de corte y reintento.

#### PR-11 · `feat/web-hoy` · T1.5 · 3 h · US-04, US-01
- [ ] Pantalla Hoy: la sesión que toca según `weekday`, con el botón "Empezar" (un toque) y un selector para elegir otra.
- [ ] Si ya hay una sesión de hoy abierta, la retoma.
- [ ] Primer uso, sin rutina: botón "Importar rutina", que llama a `POST /routines/import` y sincroniza.

**Listo cuando:** abrir la app y empezar la sesión lleva un toque, también en modo avión.

#### PR-12 · `feat/web-tarjeta-ejercicio` · T1.6 · 5 h · US-11
- [ ] Nace `web/src/metrics/`:
  - 1RM estimado con Epley, solo si el ejercicio tiene `e1rm_eligible` y la serie es de 12 repeticiones o menos;
  - mejor marca;
  - última vez.
  - Todo se calcula desde Dexie, sin red.
- [ ] Tarjeta de ejercicio:
  - prescripción (3 × 6–10 · RIR 1–2 · descanso);
  - última vez y mejor marca;
  - series de hoy.
- [ ] Peso y repeticiones se precargan desde la misma serie de la última sesión. El RIR no se precarga nunca.
- [ ] Series objetivo de la semana: `ramp_sets` mientras dura la rampa, `target_sets` después.
- [ ] Tests unitarios de las funciones de métricas.

**Listo cuando:** en modo avión, cada ejercicio muestra su última vez y su mejor marca.

**Cierre S2:** abrís la sesión del día en modo avión, en menos de 1,5 s, y ves la historia de cada ejercicio.

---

## S3 — Registro offline: la serie en 5 s (≈12 h)

**Objetivo:** reemplazar la planilla en el gimnasio.

#### PR-13 · `feat/web-registro-serie` · T1.7 · 5 h · US-05 a US-08
- [ ] Panel en la mitad inferior de la pantalla:
  - PESO −/+ con el paso `weight_step_kg` y REPS −/+;
  - mantener presionado repite;
  - tocar el número abre el teclado numérico.
- [ ] Fichas de RIR 0, 1, 2 y 3+ (3+ se guarda como 3) que guardan la serie al tocarlas, más "Guardar sin RIR".
- [ ] La confirmación aparece en menos de 100 ms, sin diálogo: se escribe local y no se espera a la red. El foco pasa a la serie siguiente, y con la última serie, al ejercicio siguiente.
- [ ] Indicador ↑ = ↓ con símbolo, comparado con la misma serie de la última vez.
- [ ] Tocar una serie guardada la edita o la borra, con "Deshacer" durante 5 s.
- [ ] "+ serie extra" y agregar un ejercicio del catálogo a la sesión. Esas series van con `routine_day_exercise_id` en NULL y se marcan "fuera de rutina".

**Listo cuando:** una serie sin cambios se registra con un toque y una con un ajuste, con dos.

#### PR-14 · `feat/web-interaction-ms` · T1.8 · 2 h
- [ ] Medir el tiempo entre el primer toque sobre la serie y la confirmación con `performance.now()`, y guardarlo en `interaction_ms`.
- [ ] Checklist de modo avión en `docs/`, corrido en tu celular real:
  - registrar series;
  - cerrar la app a mitad de sesión;
  - matarla desde el sistema;
  - reabrir y sincronizar.

**Listo cuando:** pasa el checklist sin perder ninguna serie confirmada.

#### PR-15 · `feat/web-cierre-sesion` · T1.9 · 2 h · US-09
- [ ] Al terminar la sesión: horas de sueño y molestias, cada una en un campo y opcionales.
- [ ] Al abrir la app, una sesión con series de un día anterior y sin `ended_at` se cierra sola.

**Listo cuando:** una sesión que no cerraste ayer aparece cerrada hoy.

**Buffer: 3 h** para lo que aparezca en la prueba en el gimnasio.

**Cierre S3:** registrás una sesión completa en el gimnasio, sin señal.

---

## S4 — Semana de uso real + prompt del brain (≈11 h)

**Objetivo:** cerrar la etapa 1 usando la app una semana con la planilla de respaldo. Mientras, sin pantallas nuevas, se prueba el prompt con datos reales.

#### PR-16 · `fix/registro-uso-real` · ~5 h
- [ ] Lo que aparezca en la semana de uso. Si son arreglos independientes, un PR por arreglo.
- [ ] Al final de la semana, comparar app y planilla: mismas series, mismos pesos.

#### PR-17 · `feat/brain-prompt-cli` · T3.2 · 6 h
- [ ] Bloques A y B del prompt (sección 5) en `api/app/brain/prompt/`, con `PROMPT_VERSION`.
- [ ] Esquema de salida como modelo Pydantic en `api/app/brain/schema.py`, para que PR-26 lo reuse.
- [ ] CLI `analyze input.json`:
  - arma la llamada: bloques A y B, el bundle como bloque C cacheable y el input como mensaje;
  - usa el modelo de `BRAIN_MODEL`;
  - guarda la respuesta y los tokens.
- [ ] Los 6 casos de prueba de la sección 5 como JSON en `brain/cases/`, armados a mano desde la planilla y tu semana de app: datos normales, casi sin RIR, menos de 3 sesiones, dolor de hombro, pregunta de dieta y un tema sin cobertura en el brain.
- [ ] Correrlos con dos modelos (por ejemplo `claude-sonnet-5-5` y `claude-opus-5-5`) y anotar en `brain/cases/RESULTADOS.md` qué hizo cada uno en cada caso, los tokens reales y el costo.

**Listo cuando:** los 6 casos se comportan como pide la sección 5. De acá sale la decisión de `BRAIN_MODEL` y del presupuesto.

**Cierre S4 (= cierre etapa 1):** una semana sin perder series; la app coincide con la planilla.

---

## S5 — Calendario y progreso (≈15 h)

#### PR-18 · `feat/metricas` · T2.1 · 5 h
- [ ] Completar `web/src/metrics/` con el volumen semanal (de lunes a domingo), en series directas y fraccionales, a partir de `exercise_muscle`.
- [ ] Fixtures dorados en `fixtures/metrics/*.json` (entrada: series; salida: lo esperado), compartidos con Python (ajuste 3).
- [ ] Un fixture es la rutina desde la semana 3 y tiene que dar:

| Músculo | Series fraccionales |
| --- | --- |
| Pectoral | 12 |
| Deltoides lateral | 12 |
| Deltoides posterior | 6,5 |
| Deltoides anterior | 4,5 |
| Espalda | 10 |
| Tríceps | 10,5 |
| Bíceps | 10 |
| Cuádriceps | 11 |
| Isquiotibiales | 10 |
| Glúteos | 4,5 |
| Pantorrillas | 10 |
| Recto femoral | 5 |

**Listo cuando:** el fixture de la rutina pasa.

#### PR-19 · `feat/web-calendario` · T2.2 · 5 h · US-12
- [ ] Vista mensual con ● entrenado y ○ planificado y no hecho, con leyenda en texto.
- [ ] Sesiones de esta semana contra las planificadas (X de 5), racha de semanas cumplidas y promedio de las últimas 3 semanas.
- [ ] Tocar un día abre el resumen de la sesión, desde donde se puede cambiar su fecha.

**Listo cuando:** funciona sin red y cambiar una fecha se sincroniza.

#### PR-20 · `feat/web-progreso-ejercicio` · T2.3 · 5 h · US-13
- [ ] Recharts con selector de ejercicio y tres métricas: 1RM estimado, peso máximo y volumen.
- [ ] Rangos de 4 semanas, 3 meses y todo.
- [ ] Tocar un punto muestra esa sesión. Abajo, la lista de sesiones con ↑ = ↓.

**Listo cuando:** funciona sin red.

---

## S6 — Músculos, peso corporal, ajustes y editor de rutina (≈15 h)

#### PR-21 · `feat/web-volumen-musculo` · T2.4 · 4 h · US-14
- [ ] Barras de series fraccionales de la semana contra la meta de la rutina vigente (`routine_muscle_target`).
- [ ] Navegación por semana y tendencia de las últimas semanas.
- [ ] Tocar un músculo muestra qué ejercicios aportaron series y con qué factor.

**Listo cuando:** las cifras salen del mapa de factores, no de una estimación.

#### PR-22 · `feat/peso-corporal` · T2.5 · 3 h · US-15
- [ ] Pestaña Peso corporal: un campo y un toque para cargar. Si ya hay peso ese día, lo reemplaza.
- [ ] Promedio semanal y variación contra la semana anterior, en %.

**Listo cuando:** cargás el peso en modo avión y se sincroniza después.

#### PR-23 · `feat/ajustes-perfil` · 2 h · ajuste 4
- [ ] Pantalla Ajustes con:
  - paso de peso;
  - fase con sus fechas;
  - datos del perfil que van al brain;
  - opt-in de "enviar molestias al análisis", apagado por defecto.

**Listo cuando:** cambiar el paso de peso se refleja en los botones −/+ del registro.

#### PR-24 · `feat/editor-rutina` · T2.6 · 6 h · US-02, US-03
- [ ] Servicio `new_version(base, cambios)` en el backend, en una sola transacción:
  - clona la rutina vigente y llena `cloned_from_id`;
  - aplica los cambios;
  - pasa la anterior a `historica`.
  - **PR-28 lo reusa.**
- [ ] Endpoints de edición. Funcionan solo con conexión: los requisitos offline no incluyen editar la rutina.
- [ ] Pantalla:
  - agregar, quitar y reordenar ejercicios de un día;
  - editar series, repeticiones, RIR y descanso;
  - lista de versiones.
- [ ] Catálogo: un ejercicio nuevo exige elegir sus músculos y sus factores (1 o 0,5) antes de poder usarlo.
- [ ] Test: editar crea la v2, la v1 sigue consultable y nunca hay dos vigentes.

**Listo cuando:** pasa el test y la v1 sigue consultable.

**Cierre S6 (= cierre etapa 2):** cargás las series de la rutina y el volumen que muestra la app coincide con la tabla de `rutina-2026-10-20`.

---

## S7 — Brain: backend (≈15 h)

#### PR-25 · `feat/api-resumen-metricas` · T3.3 · 9 h (6 del diseño + 3 del port a Python)
- [ ] `api/app/metrics/` en Python, con los mismos fixtures dorados de PR-18. Si las dos versiones divergen, falla el test.
- [ ] Arma el JSON de entrada de la sección 5:
  - perfil sin nombre ni correo, con la edad calculada desde `birth_year`;
  - rutina vigente;
  - adherencia y volumen semanal;
  - por ejercicio: `status_app`, `lost_reps_2_sessions`, las últimas 3 sesiones como tripletas y `e1rm_by_week`;
  - peso corporal, recuperación y `data_quality`.
- [ ] Reglas de estado de la sección 5 (`sin_datos`, `progresa`, `retrocede`, `estancado`, `mantiene`), con tests de casos borde para cada una.
- [ ] Alias cortos por llamada (`rde-1`, `ex-banca`) y la tabla para traducirlos de vuelta.
- [ ] `discomfort` viaja solo si `send_discomfort_to_ai` está activo.

**Listo cuando:** el resumen de tus datos reales se parece al ejemplo de la sección 5 y no lleva datos personales.

#### PR-26 · `feat/api-brain-client` · T3.4 · 6 h
- [ ] Migración de `brain_bundle`, `analysis` y `analysis_change`, más la FK circular `routine.from_analysis_id`.
- [ ] `make upload-bundle`: sube el bundle al servidor y lo registra en `brain_bundle`.
- [ ] Llamada con el SDK de Anthropic:
  - system A + B + C, con C marcado como cacheable;
  - modelo de `BRAIN_MODEL`;
  - salida con JSON Schema.
- [ ] Validaciones de la sección 5:
  - la respuesta cumple el esquema;
  - las citas existen en `pages_json`;
  - los ids existen y el valor `from` coincide con el actual;
  - `basis` y `evidence_level` son coherentes;
  - los valores `to` pasan la cordura técnica.
  - Si algo falla, un reintento con el error; si vuelve a fallar, el análisis queda `fallido` con `raw_response`.
- [ ] Se guardan las métricas enviadas, los tokens, `prompt_version`, `brain_version` y `model`. Los cambios quedan `pendiente`.
- [ ] Tests con el cliente mockeado:
  - respuesta válida;
  - cita inexistente;
  - `from` desfasado;
  - JSON roto dos veces seguidas.

**Listo cuando:** pasan los cuatro tests.

**Cierre S7:** un análisis con tus datos, pedido por API, queda guardado y validado.

---

## S8 — Brain: pantallas (≈14 h)

#### PR-27 · `feat/analisis-pantalla` · T3.5 · 5 h · US-16, US-17
- [ ] `POST /analyses` y `GET /analyses/:id`. Subir el timeout del proxy en nginx, porque la llamada tarda.
- [ ] Pantalla:
  - ventana de 1 semana, 4 semanas o desde esta versión de la rutina;
  - "Analizar" desactivado sin red, con el motivo;
  - sincroniza antes de pedir;
  - estados de carga y de error.
- [ ] Resultado:
  - resumen y confianza;
  - estado de cada ejercicio;
  - volumen contra la meta;
  - alertas y `data_gaps`;
  - la base de cada afirmación.
  - Las cifras salen de los datos de la app, no del texto del modelo.

**Listo cuando:** un error de la API se ve claro y no se pierde nada.

#### PR-28 · `feat/analisis-cambios` · T3.6 · 6 h · US-18
- [ ] Una tarjeta por cambio: qué cambia, por qué, qué esperar, base, nivel y páginas.
- [ ] Aceptar busca el target en la rutina vigente siguiendo `cloned_from_id`, compara `from` y aplica con `new_version` (`source = brain`, `from_analysis_id`). El cambio queda `aceptado`, con `applied_routine_id`.
- [ ] Si `from` ya no coincide, el cambio pasa a `obsoleto` y la tarjeta lo dice.
- [ ] Rechazar.

**Listo cuando:** aceptar dos cambios del mismo análisis, de a uno, da la v2 y la v3, con los dos cambios aplicados.

#### PR-29 · `feat/historial-analisis` · T3.7 · 3 h · US-19
- [ ] Lista de análisis, con sus métricas y qué aceptaste o rechazaste.
- [ ] Versiones de la rutina, con lo que cambió entre una y otra.
- [ ] "Volver a esta versión" crea una versión nueva; no borra historia.

**Listo cuando:** volver a una versión deja la historia completa.

**Cierre S8 (= cierre etapa 3):** un análisis real sobre tus datos devuelve cambios que aceptás, se aplican y quedan versionados.

---

## S9 — Uso real y ajuste (≈10 h + 2 semanas de uso)

#### PR-30 · `perf/registro-5s` · T4.1 · 4 h
- [ ] Consulta de la mediana de `interaction_ms` por semana.
- [ ] Encontrar qué frena (tiempos por paso) y corregirlo.

#### PR-31 · `chore/umbrales-y-textos` · T4.2 · 3 h
- [ ] Ajustar los umbrales de estado (2 % y 3 sesiones) y los textos con lo que viste usando la app.
- [ ] Si el prompt cambia, subir `PROMPT_VERSION`.

#### PR-32 · `ops/restore-test` · T4.3 · 3 h
- [ ] Revisar los errores de sincronización en los logs.
- [ ] Restaurar un `pg_dump` en una base de prueba y comparar conteos.
- [ ] Dejar el procedimiento escrito en `docs/runbook.md`.

**Cierre MVP:** la mediana del tiempo por serie, medida en tus sesiones, es de 5 s o menos.

---

## Fase 2 (sin sprint)

- Exportar a CSV y a un `registro.md` con el formato del vault (US-21).
- Importar el historial de la planilla (US-20).
- Temporizador de descanso, notas ampliadas y análisis semanal automático (US-22).
- Semanas de descarga y su tipo de cambio aplicable.
- Multiusuario, si hace falta.
