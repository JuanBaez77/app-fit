# App de entrenamiento + Brain de hipertrofia — Diseño

Oct 22, 2026 · @Juan Baez

## Resumen y decisiones clave

El MVP es una PWA offline-first donde registrás una serie en menos de 5 segundos, y un botón "Analizar" que manda un resumen de métricas al brain (tu wiki en `C:\second-brain`) y devuelve diagnóstico y cambios propuestos que aceptás o rechazás.

**Lo que encontré en el brain y que condiciona el diseño:**

- Es una wiki de markdown con git (unas 150 páginas en `wiki/`, más `CLAUDE.md` como esquema), con tu perfil, la rutina vigente (v1 del 2026-10-20, revisión el 2026-11-17) y un registro. No es un servicio: hay que empaquetarlo para que una API lo use.
- Sus reglas son estrictas: nada inventado, los rangos de volumen salen solo de la wiki y con cita, se distingue evidencia de práctica, se cambia lo mínimo y los cambios se proponen. El prompt las hereda tal cual.
- Cuenta el volumen en **series fraccionales** (la serie indirecta vale 0,5, con excepciones documentadas). Verifiqué con un script que un mapa de factores por ejercicio reproduce los números de tu rutina: pecho 12, deltoides lateral 12, tríceps 10,5, glúteos 4,5, deltoides anterior 4,5.
- Trabaja con **RIR**, no con RPE.
- Hoy tu registro vive en la planilla de Google Sheets "Registro Juan v1 — gym".

**Decisiones tomadas** (las que se apartan del brief van marcadas):

| Tema | Decisión | Por qué |
| --- | --- | --- |
| Conexión con el brain | Opción (a): llamada a la API de Claude con el brain empaquetado como system prompt (bloque cacheable) | Hasta donde sé, un Proyecto de Claude no se consulta desde un backend, así que la (b) no sirve para una app. La (c) queda como evolución si la wiki crece más que el contexto |
| Plataforma | PWA mobile-first, offline-first | Una sola base de código, instalable, y el registro no puede depender de la señal del gimnasio |
| Quién calcula | La app calcula (volumen fraccional, 1RM estimado, estado por ejercicio); el brain interpreta | Los LLM fallan en aritmética y el brain prohíbe cifras sin respaldo |
| **RIR en vez de RPE** (cambio) | Cada serie lleva RIR opcional | Es la variable que usan la rutina y la wiki |
| **Entran al MVP** (cambio) | Peso corporal, horas de sueño y molestias por sesión | La rutina vigente los pide en su sección de seguimiento, y en definición el brain no puede juzgar el déficit sin el peso. Son tres campos, no una pantalla nueva |
| Alcance de uso | Personal, con `user_id` en todas las tablas | Multiusuario después sin migrar datos |
| Cambios aceptados | Crean una versión nueva de la rutina; la anterior se conserva | Regla del brain (§6.7) |

Tamaño del brain: la wiki sin la carpeta de estudios más el esquema pesa unos 171 KB, del orden de 45 a 50 mil tokens (estimación por bytes). Con los estudios serían unos 320 KB. Por eso el bundle del MVP excluye los estudios y los cita por nombre.

## 1. Requisitos

Son 22 historias de usuario: 19 del MVP y 3 de fase 2. La que manda sobre todas es US-05: una serie sin cambios se registra con un solo toque. Prioridad: **M** = MVP, **F2** = fase 2.

### Rutinas y catálogo

**US-01 (M) — Cargar mi rutina vigente.** Como Juan, quiero partir de mi rutina actual para no armarla a mano.

- Dado que es el primer uso, cuando elijo "Importar rutina", entonces se crea la rutina v1 con los 5 días, sus ejercicios, series, rango de repeticiones, RIR y descanso de `rutina-2026-10-20`.
- Los objetivos de series por músculo quedan guardados con la rutina (pecho 12, laterales 12, etc.) para comparar después.

**US-02 (M) — Editar días y ejercicios.** Como Juan, quiero cambiar la rutina a mano cuando lo decido yo.

- Puedo agregar, quitar y reordenar ejercicios de un día, y editar series objetivo, rango de repeticiones, RIR objetivo y descanso.
- Cada edición guarda una versión nueva de la rutina; la anterior queda consultable.

**US-03 (M) — Catálogo de ejercicios con músculos.** Como Juan, quiero que cada ejercicio sepa qué músculos trabaja y con qué peso, para que el volumen semanal se calcule solo.

- Cada ejercicio tiene un músculo principal (factor 1) y sinergistas (factor 0,5), según el conteo fraccional del brain.
- Si creo un ejercicio nuevo, la app me pide elegir sus músculos antes de poder usarlo.

### Registro de sesión

**US-04 (M) — Empezar la sesión de hoy.**

- Al abrir la app veo la sesión que corresponde según el día y un botón "Empezar" (1 toque). Puedo elegir otra sesión si cambié el orden.
- Si ya hay una sesión abierta de hoy, la app la retoma donde la dejé.

**US-05 (M) — Registrar una serie sin cambios.**

- Dada una serie con peso y repeticiones precargados de la última sesión, cuando toco una ficha de RIR (0, 1, 2 o 3+), queda guardada con esos valores y ese RIR. Es 1 toque. Si no quiero anotar el RIR, toco "Guardar sin RIR".
- La confirmación se ve en menos de 100 ms y no abre ningún diálogo.
- El foco pasa solo a la serie siguiente.

**US-06 (M) — Registrar una serie con cambios.**

- Puedo ajustar peso y repeticiones con botones −/+ (peso en saltos de 2,5 kg por defecto, configurable) y el RIR con una fila de fichas (0, 1, 2, 3+) que guarda la serie al tocarla. Todo se hace con una mano y sin abrir el teclado.
- Una serie con un ajuste de peso o de repeticiones se registra en 2 toques (el ajuste y la ficha de RIR), y con dos ajustes, en 3.
- Si toco el valor, puedo tipearlo con el teclado numérico.
- **Meta medible:** la app guarda el tiempo entre el primer toque sobre una serie y su confirmación. La mediana, en las primeras 2 semanas de uso real, es de 5 s o menos.

**US-07 (M) — Corregir o borrar una serie.**

- Puedo tocar una serie ya guardada para editarla o borrarla, con opción de deshacer durante unos segundos.
- Los cambios se reflejan de inmediato en "última vez" y en las métricas.

**US-08 (M) — Agregar series o ejercicios fuera de rutina.**

- Puedo sumar una serie extra a un ejercicio, o un ejercicio del catálogo a la sesión, sin tocar la rutina.
- Lo agregado cuenta en el volumen y se marca como "fuera de rutina" en el historial.

**US-09 (M) — Cerrar la sesión.**

- Al terminar, puedo anotar horas de sueño de la noche anterior y molestias, ambos opcionales y cada uno en un solo campo.
- Una sesión con series pero sin cerrar se cierra sola al día siguiente.

**US-10 (M) — Funcionar sin conexión.**

- Todo lo anterior funciona en modo avión. Cada serie se guarda en el dispositivo antes de mostrar la confirmación.
- Al volver la conexión, la app sincroniza sola, sin duplicar series si la sincronización se corta y se reintenta.
- Si cierro la app o se apaga el celular a mitad de sesión, no pierdo ninguna serie confirmada.

### Comparación inmediata

**US-11 (M) — Ver última vez y mejor marca.**

- Cada ejercicio muestra, antes de la primera serie, la última sesión (peso × repeticiones por serie) y la mejor marca.
- Al confirmar una serie aparece un indicador: ↑ mejora, = igual, ↓ retroceso, comparada con la misma serie de la última vez. Nunca usa solo el color.
- Qué es "mejor marca": el mayor 1RM estimado de una serie de 12 repeticiones o menos. Si el ejercicio no tiene historial, no muestra indicador.

### Calendario

**US-12 (M) — Ver días entrenados, racha y frecuencia.**

- El calendario mensual marca cada día con sesión registrada y muestra la sesión (Torso, Pierna A…).
- Muestra la racha de semanas en que cumplí las sesiones planificadas y las sesiones de la semana en curso contra las planificadas.
- Puedo corregir la fecha de una sesión.

### Historial y progreso

**US-13 (M) — Gráfico por ejercicio.**

- Para un ejercicio veo, a elección, peso máximo, volumen (series × repeticiones × peso) y 1RM estimado por sesión, en un rango de fechas.
- Cada punto se puede tocar y muestra el detalle de esa sesión.

**US-14 (M) — Volumen semanal por músculo.**

- Para cada músculo veo las series fraccionales de la semana, comparadas con el objetivo de la rutina vigente, y la tendencia de las últimas semanas.
- Las cifras salen del mapa de factores del catálogo (US-03), no de una estimación.

**US-15 (M) — Peso corporal.**

- Puedo cargar mi peso en ayunas en un campo y 1 toque.
- La app muestra el promedio semanal y la variación contra la semana anterior.

### Análisis del brain

**US-16 (M) — Pedir un análisis.**

- El botón "Analizar" queda desactivado sin conexión y avisa por qué. Si hay datos sin sincronizar, la app sincroniza primero.
- Puedo elegir la ventana: "última semana", "últimas 4 semanas" o "desde el inicio de esta versión de la rutina".
- Mientras espero veo un estado de carga; si falla, el error es claro y no pierdo nada.

**US-17 (M) — Leer el diagnóstico.**

- El resultado muestra: un resumen, el estado de cada ejercicio (progresa, mantiene, estancado, retrocede), el volumen por músculo contra el objetivo, las alertas (sobreentrenamiento, músculos descuidados) y las sugerencias.
- Cada afirmación indica si se apoya en evidencia o en práctica, con el nivel de confianza, tal como lo exige el brain.
- Si faltan datos para opinar (por ejemplo, no se registró RIR), el análisis lo dice en vez de rellenar.

**US-18 (M) — Aceptar o rechazar cambios.**

- Cada cambio propuesto aparece como una tarjeta con qué cambia, por qué, qué esperar y la evidencia. Puedo aceptarlo o rechazarlo uno por uno.
- Nada se modifica en la rutina hasta que acepto.
- Al aceptar, se crea una versión nueva de la rutina con ese cambio; el cambio queda marcado como aplicado.

**US-19 (M) — Historial de análisis y versiones.**

- Puedo ver análisis anteriores, sus métricas y qué cambios acepté o rechacé.
- Puedo volver a una versión anterior de la rutina; eso crea otra versión, no borra historia.

### Fase 2

**US-20 (F2) — Importar el registro actual.** Cargar desde CSV el historial de la planilla "Registro Juan v1 — gym".

**US-21 (F2) — Exportar.** CSV de series y un `registro.md` en el formato del vault, para que el brain mantenga su fuente de verdad.

**US-22 (F2) — Temporizador de descanso, notas extendidas y análisis semanal automático.** Siguen el brief original.

### Requisitos no funcionales

| Tema | Requisito |
| --- | --- |
| Uso con una mano | Controles de registro en la mitad inferior de la pantalla, áreas táctiles de 48 px o más, sin teclado en el flujo normal |
| Offline | Registro, calendario y progreso funcionan sin red; el análisis es lo único que la requiere |
| Datos | Ninguna serie confirmada se pierde; la sincronización es idempotente; copia de seguridad diaria del servidor |
| Privacidad | A la API solo viaja el resumen de métricas, la rutina y el perfil sin nombre ni correo |
| Instalación | Instalable como PWA en Android y iOS |
| Accesibilidad | Contraste suficiente a pleno sol; nada se comunica solo con color |
| Rendimiento | Abrir la sesión del día en menos de 1,5 s con la app ya instalada |

## 2. Arquitectura y stack

La app escribe primero en el celular y sincroniza con un API propio en tu VPS; el brain viaja como un bundle de texto que ese servidor le pasa a la API de Claude junto con métricas ya calculadas.

&#91;embedded content: arquitectura · 3 zonas, 10 componentes\]

Al pedir un análisis, el servidor calcula las métricas, el cliente del brain las une al bundle y llama a la API de Claude; la respuesta se valida y se guarda antes de mostrarse. Un script de build, que corrés en tu PC, lee el vault y deja el bundle en el servidor.

### Cómo se conecta con el brain

| Opción | Qué es | Veredicto |
| --- | --- | --- |
| (a) API de Claude con el brain como contexto | El backend manda el brain empaquetado como system prompt y las métricas como mensaje | **Elegida para el MVP** |
| (b) Integración con el Proyecto de Claude | El brain vive en un Proyecto de claude.ai | Hasta donde sé, un Proyecto no se puede consultar desde un backend, así que no sirve para una app. Sigue siendo útil para conversar con el brain a mano |
| (c) Base de conocimiento propia consultada por el backend | El modelo busca páginas con una herramienta (por ejemplo `qmd`, que el vault ya usa) en vez de recibirlas todas | Evolución posible si el bundle deja de caber cómodo en contexto |

**Por qué la (a):** la wiki sin estudios pesa unos 171 KB, del orden de 45 a 50 mil tokens, y cabe entera. Con todo el brain en contexto no hay un paso de búsqueda que pueda fallar, y es lo más simple de mantener para un dev solo. Un matiz sobre el caché: con un análisis por semana el caché casi nunca estará vivo, así que contá con pagar la entrada completa en cada análisis. El bloque se marca cacheable igual, por si pedís varios seguidos (por ejemplo, probando otra ventana de fechas).

**Qué lleva el bundle:**

- Las reglas del brain que sirven a un modelo sin acceso a archivos: jerarquía de evidencia (§5), flujo de ajuste (§6.7) y reglas inquebrantables (§10). Se excluyen las operaciones de archivos, git y `qmd`.
- `wiki/conceptos`, `musculos`, `ejercicios`, `splits` y `claims` completos, más `index.md`, que da el nombre y una línea de cada estudio. Los estudios no van enteros (unos 150 KB) y se citan por nombre.
- **No** lleva `personas/` ni `rutinas/`: el perfil y la rutina los manda la app, estructurados, porque desde ahora ella es la fuente de verdad.
- Un `brain_version` (hash del commit del vault y fecha) y la lista de páginas, que se usa para validar las citas.

### Stack

| Capa | Elección | Por qué |
| --- | --- | --- |
| Frontend | React + Vite + TypeScript, `vite-plugin-pwa`, Dexie (IndexedDB), Recharts | PWA instalable con service worker; Dexie da una base local con índices; Recharts es rápido de usar para los gráficos del MVP |
| Backend | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2 + Alembic, gunicorn con workers uvicorn | Tu stack habitual de despliegue; Pydantic valida tanto la API como la respuesta del brain |
| Base de datos | PostgreSQL, en un contenedor del `docker-compose` (o una base nueva en el Postgres que ya tengas en el VPS) | Ya lo manejás y trae `uuid`, `timestamptz` y `jsonb` nativos; copia con `pg_dump` en cron. SQLAlchemy y Alembic llevan las migraciones. Para un solo usuario SQLite también alcanzaría; se elige Postgres para no migrar si hay multiusuario |
| Autenticación | Contraseña única, token de acceso corto y refresh en cookie `httpOnly`, HTTPS con nginx | Alcanza para uso personal; la tabla `app_user` ya existe para el multiusuario |
| Sincronización | Operaciones con UUID v7, idempotentes por id; último cambio gana por fila; borrado lógico | Pocos dispositivos y un solo usuario: no hace falta resolver conflictos más finos |
| Cliente del brain | SDK de Anthropic para Python, salida con JSON Schema validada con Pydantic, modelo en la variable `BRAIN_MODEL` | Poder cambiar de modelo sin tocar código |
| Despliegue | Docker Compose (api + nginx) en el VPS | Igual que tus otros proyectos |

### Flujo de "Analizar"

1. La PWA sincroniza y llama a `POST /analyses` con la ventana elegida.
2. El módulo de métricas lee la base y arma el resumen (sección 5). La app, no el modelo, hace las cuentas.
3. El cliente del brain arma la llamada: *system* = reglas de salida + bundle; mensaje = JSON de perfil, rutina vigente, objetivo y métricas.
4. Recibe el JSON del modelo y lo valida: esquema, citas `[[...]]` que existan en la lista de páginas del bundle, y cambios que apunten a ejercicios y días reales de la rutina. Si algo falla, un reintento con el error; si vuelve a fallar, el análisis se guarda como fallido y se avisa.
5. Se guarda el análisis con su `brain_version`, el modelo y las métricas enviadas; cada cambio propuesto queda en estado `pendiente`.
6. Al aceptar un cambio, el backend crea la versión siguiente de la rutina aplicándolo en una sola transacción.

### Privacidad: qué sale hacia la API

- **Se envía:** perfil sin nombre ni correo (sexo, edad, altura, peso, experiencia, objetivo, fase, equipamiento, limitaciones), rutina vigente, métricas agregadas, las últimas 3 sesiones por ejercicio, promedio semanal de peso corporal, horas de sueño y el texto de las molestias.
- **No se envía:** nombre, correo, identificadores de usuario ni el historial crudo completo.
- Las molestias son texto libre de salud y el brain exige derivar a un profesional ante dolor. Revisá los términos de uso de datos de la API antes de activarlo, y el envío de ese campo queda como opción en ajustes.

## 3. Modelo de datos

Son 15 tablas y dos ideas que las sostienen: cada fila nace con un `id` UUID generado en el cliente (para poder sincronizar sin conexión), y el volumen por músculo **no se guarda**: se calcula siempre desde `exercise_muscle`, así cambiar un factor corrige todo el historial.

**Convenciones.** Los ids son `uuid` (v7, generados en el cliente). `date` es el día local y `*_at` es `timestamptz`. Pesos en kg. Las tablas del usuario llevan `user_id`. Las que se sincronizan llevan `updated_at` y `deleted_at` (borrado lógico). Como cada fila se escribe por `id`, repetir una sincronización no duplica nada: no hace falta un registro de operaciones en el servidor.

```
app_user ── user_profile
  └─ routine (versiones) ─┬─ routine_day ── routine_day_exercise ── exercise ── exercise_muscle ── muscle
                        └─ routine_muscle_target ── muscle
  └─ session ── set_log ── exercise
  └─ body_weight
  └─ analysis ── analysis_change         analysis ── brain_bundle
```

### Esquema (PostgreSQL)

```sql
-- Catálogo y perfil -------------------------------------------------
CREATE TABLE muscle (
  id TEXT PRIMARY KEY,   -- pectoral, deltoides_anterior, deltoides_lateral, deltoides_posterior,
                         -- espalda, triceps, biceps, cuadriceps, recto_femoral,
                         -- isquiotibiales, gluteos, pantorrillas
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES muscle(id)   -- recto_femoral -> cuadriceps; regiones se reportan aparte
);
CREATE TABLE app_user (                  -- "user" es palabra reservada en PostgreSQL
  id UUID PRIMARY KEY, email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE user_profile (            -- 1 fila por usuario; es lo que se manda al brain, sin nombre
  user_id UUID PRIMARY KEY REFERENCES app_user(id),
  sex TEXT, birth_year SMALLINT, height_cm NUMERIC(4,1), experience_years NUMERIC(3,1),
  goal TEXT, priority_muscles JSONB,   -- ["pectoral","deltoides_lateral"]
  phase TEXT CHECK (phase IN ('definicion','volumen','mantenimiento')),
  phase_start DATE, phase_end DATE,
  equipment TEXT, limitations TEXT,
  weight_step_kg NUMERIC(3,2) NOT NULL DEFAULT 2.5,
  send_discomfort_to_ai BOOLEAN NOT NULL DEFAULT FALSE,  -- molestias = texto libre de salud: opt-in
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE exercise (
  id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES app_user(id),
  name TEXT NOT NULL,
  brain_page TEXT,                     -- ej. 'press-de-banca' si existe en wiki/ejercicios
  kind TEXT CHECK (kind IN ('multiarticular','aislamiento')),
  e1rm_eligible BOOLEAN NOT NULL DEFAULT TRUE,   -- FALSE para dominadas y otros con peso corporal
  updated_at TIMESTAMPTZ NOT NULL, deleted_at TIMESTAMPTZ
);
CREATE TABLE exercise_muscle (         -- ausencia de fila = el ejercicio no cuenta para ese músculo
  exercise_id UUID REFERENCES exercise(id),
  muscle_id TEXT REFERENCES muscle(id),
  factor NUMERIC(2,1) NOT NULL CHECK (factor IN (0.5, 1.0)),   -- 1 directa, 0.5 indirecta
  PRIMARY KEY (exercise_id, muscle_id)
);

-- Rutina versionada ----------------------------------------------------
CREATE TABLE routine (
  id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES app_user(id),
  version INT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('vigente','historica')),
  source TEXT CHECK (source IN ('importada','manual','brain')),
  parent_routine_id UUID REFERENCES routine(id),
  from_analysis_id UUID,               -- si nació de un cambio aceptado; la FK se agrega al final
  start_on DATE, review_on DATE,       -- ej. 2026-10-20 y 2026-11-17
  created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX one_current ON routine (user_id) WHERE status = 'vigente';
CREATE TABLE routine_day (
  id UUID PRIMARY KEY, routine_id UUID NOT NULL REFERENCES routine(id),
  name TEXT NOT NULL,
  weekday SMALLINT CHECK (weekday BETWEEN 1 AND 7),   -- 1 = lunes; NULL si no tiene día fijo
  position INT NOT NULL
);
CREATE TABLE routine_day_exercise (
  id UUID PRIMARY KEY, routine_day_id UUID NOT NULL REFERENCES routine_day(id),
  exercise_id UUID NOT NULL REFERENCES exercise(id), position INT NOT NULL,
  target_sets INT NOT NULL, reps_min INT NOT NULL, reps_max INT NOT NULL,
  rir_min INT, rir_max INT, rest_sec INT,
  ramp_sets INT, ramp_weeks INT,       -- series de las primeras semanas (la rutina sube el volumen de a poco)
  note TEXT
);
CREATE TABLE routine_muscle_target (   -- la tabla "Volumen semanal por músculo" de la rutina
  routine_id UUID NOT NULL REFERENCES routine(id),
  muscle_id TEXT NOT NULL REFERENCES muscle(id),
  target_sets NUMERIC(4,1) NOT NULL, range_min NUMERIC(4,1), range_max NUMERIC(4,1),
  priority TEXT CHECK (priority IN ('alta','media','mantenimiento')),
  PRIMARY KEY (routine_id, muscle_id)
);

-- Registro -------------------------------------------------------------
CREATE TABLE session (
  id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES app_user(id),
  routine_id UUID REFERENCES routine(id), routine_day_id UUID REFERENCES routine_day(id),
  date DATE NOT NULL, started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ,
  sleep_hours NUMERIC(3,1), discomfort TEXT,
  updated_at TIMESTAMPTZ NOT NULL, deleted_at TIMESTAMPTZ
);
CREATE TABLE set_log (
  id UUID PRIMARY KEY, session_id UUID NOT NULL REFERENCES session(id),
  exercise_id UUID NOT NULL REFERENCES exercise(id),
  routine_day_exercise_id UUID,        -- NULL = serie fuera de rutina
  set_number INT NOT NULL,
  weight_kg NUMERIC(6,2) NOT NULL CHECK (weight_kg >= 0),   -- en dominadas, el peso agregado
  reps SMALLINT NOT NULL CHECK (reps > 0),
  rir SMALLINT CHECK (rir BETWEEN 0 AND 5),   -- NULL si no se anotó
  interaction_ms INT,                  -- primer toque -> confirmar (mide la meta de 5 s)
  logged_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL, deleted_at TIMESTAMPTZ
);
CREATE INDEX set_by_exercise ON set_log (exercise_id, logged_at) WHERE deleted_at IS NULL;
CREATE TABLE body_weight (
  id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES app_user(id),
  date DATE NOT NULL, kg NUMERIC(5,2) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL, deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX one_weight_per_day ON body_weight (user_id, date) WHERE deleted_at IS NULL;

-- Brain y análisis ---------------------------------------------------
CREATE TABLE brain_bundle (
  version TEXT PRIMARY KEY,            -- hash del commit del vault
  built_at TIMESTAMPTZ NOT NULL, bytes INT,
  pages_json JSONB NOT NULL            -- lista de páginas citables
);
CREATE TABLE analysis (
  id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL, window_from DATE NOT NULL, window_to DATE NOT NULL,
  routine_id UUID NOT NULL REFERENCES routine(id),
  brain_version TEXT NOT NULL REFERENCES brain_bundle(version),
  model TEXT NOT NULL, prompt_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok','fallido')),
  metrics_json JSONB NOT NULL,         -- exactamente lo que se envió
  response_json JSONB,                 -- respuesta validada
  raw_response TEXT,                   -- solo si falló la validación
  input_tokens INT, output_tokens INT
);
CREATE TABLE analysis_change (
  id UUID PRIMARY KEY, analysis_id UUID NOT NULL REFERENCES analysis(id),
  position INT NOT NULL,
  type TEXT NOT NULL,                  -- enum de la sección 5
  target_json JSONB NOT NULL,          -- ids afectados, valor antes y valor después
  title TEXT NOT NULL, rationale TEXT, expectation TEXT,
  basis TEXT CHECK (basis IN ('evidencia','practica')),
  evidence_level SMALLINT, evidence_links_json JSONB,
  status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente','aceptado','rechazado','obsoleto')),
  decided_at TIMESTAMPTZ, applied_routine_id UUID REFERENCES routine(id)
);

-- Referencia circular: routine <-> analysis
ALTER TABLE routine ADD FOREIGN KEY (from_analysis_id) REFERENCES analysis(id);
```

### Lo que se calcula y no se guarda

- **Volumen semanal por músculo**, en series directas y en series fraccionales (lunes a domingo):

```sql
SELECT em.muscle_id,
       COUNT(*) FILTER (WHERE em.factor = 1) AS directas,
       SUM(em.factor)                        AS fraccionales
FROM set_log s
JOIN session ss ON ss.id = s.session_id
JOIN exercise_muscle em ON em.exercise_id = s.exercise_id
WHERE s.deleted_at IS NULL AND ss.deleted_at IS NULL
  AND ss.date BETWEEN :lunes AND :domingo
GROUP BY em.muscle_id;
```

- **1RM estimado** por serie: peso × (1 + repeticiones / 30), fórmula de Epley. Solo si el ejercicio lo permite y la serie tiene 12 repeticiones o menos, porque con más repeticiones la estimación pierde precisión. Es una convención de la app, no sale del brain.
- **Mejor marca**: el mayor 1RM estimado histórico del ejercicio. **Última vez**: las series de la sesión anterior con ese ejercicio.
- **Objetivo de series de la semana** de un ejercicio: `ramp_sets` mientras la semana desde `routine.start_on` sea menor o igual a `ramp_weeks`, y `target_sets` después.

### Mapa de factores sembrado

Sale de cómo la rutina vigente cuenta sus series. Lo verifiqué con un script: aplicado a las series de tu rutina de la semana 3 en adelante, da los mismos números que la tabla de volumen de `rutina-2026-10-20`.

| Ejercicios | Músculos con factor 1 | Músculos con factor 0,5 |
| --- | --- | --- |
| Press de banca, press inclinado (barra y mancuernas) | Pectoral | Deltoides anterior, tríceps |
| Cruces en polea | Pectoral | — |
| Remo en T, remo sentado en polea | Espalda | Bíceps, deltoides posterior |
| Dominadas, jalón al pecho | Espalda | Bíceps |
| Elevaciones laterales | Deltoides lateral | — |
| Aperturas invertidas en polea | Deltoides posterior | — |
| Extensión de tríceps por encima de la cabeza | Tríceps | — |
| Curl con mancuernas, barra o polea | Bíceps | — |
| Prensa, sentadilla | Cuádriceps | Glúteos |
| Extensión de cuádriceps | Cuádriceps, recto femoral | — |
| Curl femoral acostado | Isquiotibiales | — |
| Peso muerto rumano | Isquiotibiales | Glúteos |
| Elevación de talones de pie | Pantorrillas | — |

Las excepciones del brain quedan en el mapa como filas que faltan: el press de banca no cuenta para el deltoides lateral, y la prensa y la sentadilla no cuentan para el recto femoral (\[\[press-de-banca-hace-crecer-el-deltoides-anterior-no-el-medio\]\], \[\[los-multiarticulares-de-pierna-casi-no-hacen-crecer-el-recto-femoral\]\]).

Resultado de la verificación, por músculo y por semana, con las series de la rutina de la semana 3 en adelante:

| Músculo | Calculado (fraccional) | En la rutina vigente |
| --- | --- | --- |
| Pectoral | 12 | 12 directas |
| Deltoides lateral | 12 | 12 directas |
| Deltoides posterior | 6,5 | 4 directas + \~2,5 fraccionales |
| Deltoides anterior | 4,5 | 0 directas, \~4,5 fraccionales |
| Espalda | 10 | 10 directas |
| Tríceps | 10,5 | 6 directas, \~10,5 con los press |
| Bíceps | 10 | 5 directas, \~10 con remos y jalones |
| Cuádriceps | 11 | 11 directas |
| Isquiotibiales | 10 | 10 directas |
| Glúteos | 4,5 | 0 directas, \~4,5 fraccionales |
| Pantorrillas | 10 | 10 directas |

El recto femoral da 5 series (las extensiones), igual que las "5 de ellas son extensiones" de la rutina.

## 4. Wireframes

Son cuatro pantallas para el celular en vertical. Los números son de ejemplo, no son tus datos. En el registro, todo lo que se toca está en la mitad inferior de la pantalla, donde llega el pulgar.

### 4.1 Registro de sesión

```
┌────────────────────────────────────────┐
│ ‹  Torso · lun 19 oct            1 / 7 │
├────────────────────────────────────────┤
│ Press de banca con barra               │
│ 3 × 6–10 · RIR 1–2 · desc. 2–3 min     │
│                                        │
│ Última vez   80×8   80×8   80×7        │
│ Mejor marca  80×8   (1RM ≈ 101 kg)     │
│                                        │
│  1   80 kg × 9   RIR 1        ↑        │
│  2   80 kg × 8   RIR 2        =        │
│ ▶3   80 kg × 7   · · ·                 │
│  + serie extra                         │
├────────────────────────────────────────┤
│  PESO   [ − ]    80 kg    [ + ]        │
│  REPS   [ − ]     7       [ + ]        │
│                                        │
│  ¿Cuántas te quedaban?  Tocá = guarda  │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │
│  │  0  │ │  1  │ │  2  │ │ 3+  │       │
│  └─────┘ └─────┘ └─────┘ └─────┘       │
│  [ Guardar sin RIR ]                   │
├────────────────────────────────────────┤
│ Remo T ▸ Inclinado ▸ Jalón ▸ …         │
└────────────────────────────────────────┘
```

- Peso y repeticiones se precargan con los de la misma serie de la última sesión. El RIR **no** se precarga: tiene que ser una respuesta tuya, porque el brain saca sus conclusiones de ese dato.
- Las fichas de RIR guardan la serie al tocarlas. Una serie sin cambios es 1 toque; con cambio de peso o repeticiones, 2 o 3. "Guardar sin RIR" queda para cuando no querés anotarlo.
- − y + mueven el peso de a 2,5 kg (configurable) y las repeticiones de a 1; mantener presionado repite. Tocar el número abre el teclado numérico.
- ↑ = ↓ comparan con la misma serie de la última vez. Van con símbolo, no solo con color.
- Tocar una serie guardada la edita. Al borrar, aparece "Deshacer" durante 5 segundos.
- Al guardar la última serie de un ejercicio, la pantalla pasa sola al siguiente.

### 4.2 Calendario

```
┌────────────────────────────────────────┐
│ Calendario                ‹ oct 2026 › │
├────────────────────────────────────────┤
│   L    M    X    J    V    S    D      │
│                  1    2    3    4      │
│   5●   6●   7●   8●   9●  10   11      │
│  12●  13●  14●  15●  16○  17   18      │
│  19●  20●  21●  22●  23   24   25      │
│  26   27   28   29   30   31           │
│                                        │
│ ● entrenado   ○ planificado y no hecho │
├────────────────────────────────────────┤
│ Esta semana            4 de 5 sesiones │
│ Racha                 6 semanas al día │
│ Últimas 3 semanas     4,3 sesiones/sem │
├────────────────────────────────────────┤
│ Jue 22 oct · Tirón                   › │
│ 5 ejercicios · 16 series               │
└────────────────────────────────────────┘
```

- Cada día con sesión muestra ●, y ○ si estaba planificada y no se hizo. Tocar un día abre el resumen de esa sesión abajo.
- "Racha" cuenta las semanas seguidas en que cumpliste las sesiones planificadas. "Últimas 3 semanas" es el promedio de sesiones por semana.
- Desde el resumen se puede cambiar la fecha de una sesión.

### 4.3 Progreso

```
┌────────────────────────────────────────┐
│ Progreso                               │
│ [Ejercicio]  Músculos  Peso corporal   │
├────────────────────────────────────────┤
│ Press de banca con barra             ▾ │
│ [1RM est.]  Peso máx.  Volumen         │
│                                        │
│ 1RM estimado (kg)                      │
│ 104 ┤                          ●       │
│ 102 ┤                      ●           │
│ 100 ┤      ●   ●   ●   ●               │
│  98 ┤  ●                               │
│     └─┬───┬───┬───┬───┬───┬───┬──      │
│      3 sep                22 oct       │
│ [ 4 sem ]  3 meses   Todo              │
├────────────────────────────────────────┤
│ 22 oct   80×9  80×8  80×7            ↑ │
│ 19 oct   80×8  80×7  80×7            = │
│ 15 oct   80×8  80×7  77,5×8          ↓ │
└────────────────────────────────────────┘
```

```
┌────────────────────────────────────────┐
│ Progreso                               │
│ Ejercicio  [Músculos]  Peso corporal   │
├────────────────────────────────────────┤
│ Series fraccionales · sem 19–25 oct    │
│ ◂ semana anterior          siguiente ▸ │
│                                        │
│ Pectoral        ████████░░░░ 8 / 12    │
│ Delt. lateral   ██████░░░░░░ 6 / 12    │
│ Delt. posterior ████████░░░░ 4,5 / 6,5 │
│ Espalda         ████████░░░░ 7 / 10    │
│ Cuádriceps      █████████░░░ 8 / 11    │
│ Isquiotibiales  ████████░░░░ 7 / 10    │
│                                        │
│ Meta = objetivo de la rutina vigente.  │
│ Tocar un músculo: qué ejercicios       │
│ aportaron series y con qué factor.     │
└────────────────────────────────────────┘
```

- **Ejercicio:** un gráfico por vez, con tres métricas intercambiables (1RM estimado, peso máximo, volumen) y un rango de fechas. Cada punto se toca para ver esa sesión.
- **Músculos:** barras de series fraccionales de la semana contra la meta de la rutina vigente, con navegación por semana. Tocar un músculo muestra qué ejercicios aportaron series y con qué factor.
- **Peso corporal** (tercera pestaña): campo de carga rápida arriba, promedio semanal debajo y variación contra la semana anterior.

### 4.4 Análisis

```
┌────────────────────────────────────────┐
│ Análisis                     [4 sem ▾] │
│ ┌──────────────────────────────────┐   │
│ │            ✦  ANALIZAR           │   │
│ └──────────────────────────────────┘   │
│ Último: hace 7 días · brain a1b2c3d    │
├────────────────────────────────────────┤
│ RESUMEN               Confianza: media │
│ Cargas sostenidas en déficit. Pecho y  │
│ laterales cerca de la meta de series.  │
│                                        │
│ EJERCICIOS                             │
│ Press de banca              ↑ progresa │
│ Press inclinado             = mantiene │
│ Remo en T                  ⚠ estancado │
│                                        │
│ VOLUMEN VS. META                       │
│ Delt. lateral   ██████░░░░░░ 6 / 12    │
│ ⚠ Falta RIR en 40 % de las series      │
├────────────────────────────────────────┤
│ CAMBIOS PROPUESTOS              1 de 2 │
│ Sumar 1 serie de laterales (Tirón)     │
│ Por qué: 6 de 12 series de la meta     │
│ Base: evidencia · nivel 1              │
│ [[volumen-semanal-dosis-respuesta…]]   │
│ Esperar: acercarse al rango 10–14      │
│ ┌────────────┐   ┌────────────┐        │
│ │  Rechazar  │   │  Aceptar   │        │
│ └────────────┘   └────────────┘        │
└────────────────────────────────────────┘
```

- "Analizar" se desactiva sin conexión. La ventana de fechas se elige antes de tocarlo.
- Arriba va lo que el brain concluyó; abajo, los cambios propuestos de a uno, con Aceptar y Rechazar. Cada cambio muestra su base: evidencia (con nivel y página de la wiki) o práctica.
- El aviso de datos faltantes (por ejemplo, RIR sin registrar) aparece cuando el brain no puede opinar con lo que recibió.
- Aceptar crea una versión nueva de la rutina; la pantalla de rutinas la marca como "del brain".

## 5. Prompt y formato de datos para el brain

En cada análisis el modelo recibe las reglas del brain (que ya están en la wiki), las reglas de la app y un JSON con perfil, rutina y métricas ya calculadas; devuelve un JSON con diagnóstico y cambios que la app sabe aplicar.

### Cómo se arma la llamada

| Parte | Contenido | Cuándo cambia |
| --- | --- | --- |
| `system`, bloque A | Rol y reglas inquebrantables del brain (texto más abajo) | Al versionar el prompt (`prompt_version`) |
| `system`, bloque B | Esquema de salida y tipos de cambio | Al versionar el prompt |
| `system`, bloque C (cacheable) | El bundle: `<brain version="a1b2c3d">` con una `<page path="wiki/conceptos/volumen.md">` por página | Cada vez que reconstruís el bundle |
| `user` | El JSON de entrada, en cada análisis | En cada análisis |

### Formato de entrada

La app arma este JSON; el modelo nunca recibe el historial crudo. Convenciones:

- Cada serie es una tripleta `[kg, repeticiones, RIR]`, con RIR `null` si no se anotó. Es compacto y ahorra tokens.
- Solo las últimas 3 sesiones de cada ejercicio van en detalle; el resto llega resumido por semana (`e1rm_by_week`).
- Los ids son alias cortos por llamada (`rde-1`, `ex-banca`); el servidor los traduce de vuelta al aplicar un cambio.
- `direct` cuenta las series con factor 1 y `fractional` suma también las indirectas con factor 0,5, igual que el brain.
- `status_app` y `lost_reps_2_sessions` los calcula la app con las reglas de la tabla que sigue.
- `discomfort` solo viaja si activaste el envío en ajustes.

Ejemplo abreviado (valores ilustrativos):

```json
{
  "schema_version": 1,
  "today": "2026-11-17",
  "window": { "from": "2026-10-20", "to": "2026-11-16", "weeks": 4, "label": "desde el inicio de la rutina v1" },
  "profile": {
    "sex": "masculino", "age": 21, "height_cm": 174, "weight_kg": 73,
    "experience_years": 4, "habitual_rir": 2,
    "goal": "hipertrofia", "priority_muscles": ["pectoral", "deltoides_lateral"],
    "phase": { "name": "definicion", "start": "2026-10-20", "target": "inicios de diciembre de 2026" },
    "equipment": "gimnasio completo, sin hack ni máquinas guiadas de pecho y espalda",
    "limitations": null
  },
  "routine": {
    "version": 1, "start_on": "2026-10-20", "review_on": "2026-11-17",
    "muscle_targets": [
      { "muscle_id": "pectoral", "target": 12, "range": [10, 14], "priority": "alta" },
      { "muscle_id": "deltoides_lateral", "target": 12, "range": [10, 14], "priority": "alta" }
    ],
    "days": [
      { "id": "d1", "name": "Torso", "weekday": 1, "exercises": [
        { "id": "rde-1", "exercise_id": "ex-banca", "name": "Press de banca con barra", "brain_page": "press-de-banca",
          "sets": 3, "reps": [6, 10], "rir": [1, 2], "rest_s": [120, 180] }
      ] }
    ]
  },
  "metrics": {
    "adherence": { "planned": 20, "done": 18 },
    "weekly_volume": [
      { "week_start": "2026-10-19",
        "muscles": { "pectoral": { "direct": 10, "fractional": 10 },
                     "deltoides_lateral": { "direct": 10, "fractional": 10 } } }
    ],
    "exercises": [
      { "exercise_id": "ex-banca", "name": "Press de banca con barra", "sessions_in_window": 4,
        "status_app": "progresa", "lost_reps_2_sessions": false,
        "best_e1rm_kg": { "value": 101.3, "date": "2026-11-03" },
        "e1rm_by_week": [98.7, 98.7, 101.3, 101.3],
        "last_sessions": [ { "date": "2026-11-16", "sets": [[80, 8, 2], [80, 8, 2], [80, 7, 1]] } ] }
    ],
    "body_weight": { "weekly_avg_kg": [73.0, 72.6, 72.3, 71.9], "change_pct_per_week": [-0.5, -0.4, -0.6] },
    "recovery": { "avg_sleep_h": 7.4, "discomfort": [] },
    "data_quality": { "sets_total": 312, "rir_logged_pct": 0.62 }
  },
  "request": { "type": "analisis" }
}
```

### Estados que calcula la app

| Estado | Regla |
| --- | --- |
| `sin_datos` | Menos de 3 sesiones del ejercicio en la ventana |
| `progresa` | En las últimas 2 sesiones hubo una mejor marca de la ventana (1RM estimado de la sesión; si todas las series pasan de 12 repeticiones, kg × repeticiones de la mejor serie) |
| `retrocede` | Las últimas 2 sesiones quedan más de 2 % por debajo del promedio de las anteriores |
| `estancado` | 3 sesiones seguidas sin superar la mejor marca de la ventana y sin retroceso |
| `mantiene` | Todo lo demás |

Los umbrales (2 %, 3 sesiones) son arbitrarios y de la app: no vienen del brain y se ajustan con el uso. `lost_reps_2_sessions` aplica la señal de la rutina vigente ("si perdés repeticiones 2 sesiones seguidas"), que el brain etiqueta como práctica sin evidencia ingerida.

### Prompt del sistema (bloques A y B)

```text
Sos el analista del brain de hipertrofia: una wiki personal sobre entrenamiento de fuerza
e hipertrofia, incluida más abajo dentro de <brain>. Recibís el resumen de métricas de
entrenamiento de una persona, su rutina vigente y su objetivo. Devolvés un diagnóstico y
cambios propuestos a la rutina. Escribí en español rioplatense neutro. Los títulos de
estudios, los autores y los términos técnicos sin buena traducción (RIR, proximidad al
fallo) se dejan como están.

REGLAS DEL BRAIN (no se rompen)
1. Nada inventado. No fabriques estudios, autores, años, DOIs ni cifras. Toda cifra de
   volumen, frecuencia o proximidad al fallo que uses como criterio sale de las páginas de
   <brain> y se cita con el nombre de esa página. Las cifras sobre la persona salen solo
   de <input>.
2. Sin página, sin afirmación. Cada recomendación enlaza a una página que exista en
   <brain>. Si el brain no cubre algo, decí "sin evidencia ingerida" y marcá la base como
   "practica".
3. Distinguí evidencia de opinión en cada hallazgo y cada cambio (campo basis) y da el
   nivel de evidencia de 1 a 5 según la jerarquía que figura en <brain>.
4. Declará la incertidumbre: diferencias individuales, poblaciones de los estudios
   distintas a la de la persona, estudios cortos. Un estudio nuevo no borra a uno viejo.
5. Cambiá lo mínimo necesario. No rehagas lo que funciona. Cada cambio dice qué, por
   qué, qué evidencia lo respalda y qué esperar.
6. Seguridad. No diagnostiques ni trates lesiones. Ante dolor, mareos, síntomas cardíacos
   o condiciones médicas, recomendá consultar a un profesional y no propongas cambios
   sobre esa zona. No des consejos de sustancias ni dietas extremas. En una fase de
   definición no armes un plan de alimentación: sugerí un nutricionista.
7. Las fuentes secundarias no sirven como fuente de cifras.

REGLAS DE LA APP
8. Todo lo que hay en <input> ya fue calculado por la app. No hagas cuentas ni
   estimaciones propias. Si te falta un dato para opinar, escribilo en data_gaps y no
   rellenes.
9. Leé el estado de cada ejercicio (status_app) según la fase. En definición, mantener la
   carga con el mismo RIR ya es un buen resultado; una caída marcada de fuerza es una
   señal a revisar.
10. Si data_quality muestra poco RIR registrado o la ventana es corta, bajá la confianza y
    decilo en confidence_reason.
11. La app solo sabe aplicar los tipos de cambio del esquema. Si querés sugerir algo que no
    encaja (dieta, descarga, otro tipo de ajuste), ponelo en notes, no en changes.
12. Los cambios son propuestas y la persona decide: no hables como si ya estuvieran
    aplicados. Proponé como máximo 5, ordenados por impacto esperado. Si nada justifica un
    cambio, devolvé changes vacío y explicalo en summary.
13. Los ids de ejercicios, días y músculos se copian tal cual figuran en <input>.
14. evidence_links lleva solo nombres de página de <brain> (sin corchetes ni ruta).
15. Respondé únicamente con el JSON del esquema de salida.
```

El máximo de 5 cambios es un criterio de usabilidad de la app (cada cambio es una decisión para vos), no del brain.

### Formato de salida

Ejemplo abreviado (valores ilustrativos):

```json
{
  "summary": "Cargas sostenidas durante la definición; el volumen de deltoides lateral quedó por debajo del objetivo de la rutina.",
  "confidence": "media",
  "confidence_reason": "4 semanas de datos y RIR registrado en 62 % de las series.",
  "exercise_assessments": [
    { "exercise_id": "ex-banca", "status": "progresa", "comment": "Mejor marca nueva con el mismo RIR.",
      "basis": "evidencia", "evidence_links": ["progresar-da-mas-hipertrofia-que-no-progresar"] }
  ],
  "muscle_assessments": [
    { "muscle_id": "deltoides_lateral", "verdict": "por_debajo", "comment": "Por debajo del rango de la rutina.",
      "evidence_links": ["volumen-semanal-dosis-respuesta-hipertrofia"] }
  ],
  "alerts": [ { "kind": "datos", "severity": "info", "text": "Falta RIR en parte de las series; la lectura de proximidad al fallo es limitada." } ],
  "changes": [
    { "type": "set_sets",
      "target": { "routine_day_exercise_id": "rde-9", "from": 4, "to": 5 },
      "title": "Sumar 1 serie de elevaciones laterales en Empuje",
      "rationale": "El volumen semanal quedó por debajo del rango de la rutina y el músculo es prioritario.",
      "expectation": "Acercar el volumen al rango objetivo sin tocar el resto de la rutina.",
      "basis": "evidencia", "evidence_level": 1,
      "evidence_links": ["volumen-semanal-dosis-respuesta-hipertrofia"] }
  ],
  "data_gaps": ["No se registró RIR en el 38 % de las series."],
  "notes": []
}
```

Tipos de cambio que la app sabe aplicar en el MVP:

| `type` | `target` | Efecto al aceptar |
| --- | --- | --- |
| `set_sets` | `routine_day_exercise_id`, `from`, `to` | Cambia `target_sets` |
| `set_rep_range` | `routine_day_exercise_id`, `from: [min, max]`, `to: [min, max]` | Cambia `reps_min` y `reps_max` |
| `set_rir` | `routine_day_exercise_id`, `from: [min, max]`, `to: [min, max]` | Cambia `rir_min` y `rir_max` |
| `set_rest` | `routine_day_exercise_id`, `from`, `to` (segundos) | Cambia `rest_sec` |
| `swap_exercise` | `routine_day_exercise_id`, `to_exercise_id` o `new_exercise` con sus músculos y factores | Reemplaza el ejercicio y conserva series y rangos |
| `add_exercise` | `routine_day_id`, ejercicio, `position`, series, repeticiones, RIR, descanso | Inserta el ejercicio |
| `remove_exercise` | `routine_day_exercise_id` | Quita el ejercicio |
| `set_muscle_target` | `muscle_id`, `from`, `to` (objetivo y rango) | Cambia `routine_muscle_target` |

La descarga (deload) queda fuera del MVP como tipo aplicable: el brain no tiene evidencia ingerida sobre descargas y la app todavía no tiene semanas especiales. Si el modelo la sugiere, llega en `notes`.

### Validación después de la respuesta

1. La respuesta cumple el esquema (Pydantic). Si no, un reintento con el error.
2. Cada nombre en `evidence_links` existe en la lista de páginas del bundle. Los que no, se descartan y el cambio queda marcado como "sin respaldo verificable".
3. Los ids de `target` existen en la rutina y el valor `from` coincide con el actual. Si no, el cambio se descarta.
4. Un cambio con `basis: practica` no lleva `evidence_level`; uno con `basis: evidencia` necesita al menos un enlace.
5. Los valores `to` pasan chequeos de cordura técnica (series, repeticiones y RIR en rangos posibles). No son criterio de entrenamiento.
6. **Las cifras del texto no se validan solas.** Por eso la pantalla de análisis muestra siempre los datos de la app (volumen, estados, marcas) al lado del comentario del modelo, y las cifras salen de ahí, no del texto del modelo.

### Costo y calidad

- Ventana por defecto: 4 semanas, que es el ciclo de revisión de la rutina vigente; la opción rápida es 1 semana.
- Por llamada, el bundle son unos 45 a 50 mil tokens de entrada (estimación por bytes) y el JSON de entrada suma unos pocos miles más. Medí los tokens reales en las primeras llamadas con `input_tokens` y `output_tokens`, que ya se guardan en `analysis`.
- Se guardan `prompt_version`, `brain_version` y `model` en cada análisis, para comparar resultados cuando cambie cualquiera de los tres.

### Casos de prueba del prompt

Conviene correrlos a mano con el bundle real antes de programar la pantalla:

1. **Datos normales** de 4 semanas: devuelve cambios con enlaces válidos y base marcada.
2. **Casi sin RIR registrado:** baja la confianza, lo dice en `data_gaps` y no opina sobre proximidad al fallo.
3. **Menos de 3 sesiones por ejercicio:** estados `sin_datos`, confianza baja y ningún cambio.
4. **Molestia de dolor en el hombro:** recomienda consultar a un profesional y no propone cambios sobre el hombro.
5. **Pregunta de dieta en el campo `request`:** va a `notes`, sin plan de alimentación y con sugerencia de nutricionista.
6. **Lo que el brain no cubre** (por ejemplo, selección de ejercicios de espalda, que la wiki marca como práctica): el cambio sale con `basis: practica`.

## 6. Plan de desarrollo

Son 5 etapas y 30 tareas de entre 2 y 6 horas, unas 120 horas en total (estimación gruesa). La etapa 1 ya reemplaza tu planilla; el brain llega después, y su prompt se puede ir probando desde hoy.

&#91;embedded content: hoja de ruta · 5 etapas, 5 pruebas de cierre\]

Cada etapa cierra con una prueba tuya de uso real, no con una fecha. No se empieza una etapa sin pasar la prueba de la anterior.

- La revisión completa de la rutina del 2026-11-17 no depende de la app. Si la app no llega a tiempo, esa revisión se hace como hoy: por chat con el brain y con la planilla.
- Como referencia de ritmo, a 15 horas por semana son unas 8 semanas. Es un supuesto; ajustalo a tu agenda.
- Las horas son estimaciones sin medir. Revisalas al cerrar la etapa 0.

### Etapa 0 — Cimientos (≈ 13 h)

| ID | Tarea | Horas |
| --- | --- | --- |
| T0.1 | Repo con `api/`, `web/` y `brain/`, `docker-compose` con api + nginx, `Makefile` | 2 |
| T0.2 | FastAPI con SQLAlchemy y Alembic: tablas `app_user` y `muscle`, health check | 2 |
| T0.3 | Login (contraseña única, token y refresh) y endpoint `/me` | 3 |
| T0.4 | Shell de la PWA con Vite, React y `vite-plugin-pwa`; login; instalable en Android y iOS | 3 |
| T0.5 | Despliegue en el VPS con HTTPS, contenedor de PostgreSQL y copia diaria con `pg_dump` | 3 |

**Prueba de cierre:** instalás la PWA en tu celular y entrás con tu contraseña.

### Etapa 1 — Registro offline (≈ 34 h)

| ID | Tarea | Horas |
| --- | --- | --- |
| T1.1 | Migraciones del resto de las tablas de rutina y registro | 3 |
| T1.2 | Semilla: catálogo de ejercicios con factores e importación de `rutina-2026-10-20` (US-01, US-03) | 4 |
| T1.3 | Endpoints de sincronización: envío por lotes y lectura desde `updated_at` | 5 |
| T1.4 | Cliente: Dexie, cola de operaciones, reintentos e idempotencia (US-10) | 5 |
| T1.5 | Pantalla "Hoy": sesión del día y botón Empezar (US-04) | 3 |
| T1.6 | Tarjeta de ejercicio con series precargadas, última vez y mejor marca (US-11) | 5 |
| T1.7 | Controles −/+, fichas de RIR que guardan, deshacer y serie extra (US-05 a US-08) | 5 |
| T1.8 | Instrumentación de `interaction_ms` y prueba en modo avión | 2 |
| T1.9 | Cierre de sesión con sueño y molestias (US-09) | 2 |

**Prueba de cierre:** registrás una sesión completa en el gimnasio, sin señal, y después usás la app una semana con la planilla de respaldo.

### Etapa 2 — Calendario, progreso y datos (≈ 28 h)

| ID | Tarea | Horas |
| --- | --- | --- |
| T2.1 | Métricas: 1RM estimado, mejor marca y volumen semanal fraccional, con un test que reproduce la tabla de la rutina | 5 |
| T2.2 | Calendario mensual, racha y frecuencia (US-12) | 5 |
| T2.3 | Gráfico por ejercicio con tres métricas y rango de fechas (US-13) | 5 |
| T2.4 | Volumen semanal por músculo contra la meta (US-14) | 4 |
| T2.5 | Peso corporal: carga rápida y promedio semanal (US-15) | 3 |
| T2.6 | Editor de rutina y de catálogo, con versiones (US-02, US-03) | 6 |

**Prueba de cierre:** el volumen semanal que muestra la app coincide con la tabla de tu rutina al cargar las mismas series.

### Etapa 3 — Brain (≈ 36 h)

| ID | Tarea | Horas |
| --- | --- | --- |
| T3.1 | Script que arma el bundle desde el vault: páginas, versión y lista de citables | 4 |
| T3.2 | Probar el prompt a mano con datos reales y los 6 casos de la sección 5, con un script de línea de comandos | 6 |
| T3.3 | Módulo del resumen: JSON de entrada, estados y alias de ids | 6 |
| T3.4 | Cliente del brain: llamada, esquema, validaciones, reintento y guardado | 6 |
| T3.5 | Endpoint `/analyses` y pantalla de análisis con estados de carga y error (US-16, US-17) | 5 |
| T3.6 | Tarjetas de cambios, aceptar y rechazar, y creación de la versión de rutina (US-18) | 6 |
| T3.7 | Historial de análisis y de versiones de rutina (US-19) | 3 |

**Prueba de cierre:** un análisis real sobre tus datos devuelve cambios que se aceptan, se aplican y quedan versionados.

**Pista paralela:** T3.2 no depende de la app. Se puede hacer hoy armando el JSON de entrada a mano con tu planilla y llamando a la API desde un script. Si el prompt anda mal, conviene saberlo antes de construir las pantallas.

### Etapa 4 — Uso real y ajuste (≈ 10 h, más dos semanas de uso)

| ID | Tarea | Horas |
| --- | --- | --- |
| T4.1 | Medir la mediana de `interaction_ms` y corregir lo que la frene | 4 |
| T4.2 | Ajustar los umbrales de estado y los textos con lo que viste usando la app | 3 |
| T4.3 | Revisar errores de sincronización y hacer una restauración de prueba del backup | 3 |

**Prueba de cierre:** la mediana del tiempo por serie, medida en tus sesiones, es de 5 segundos o menos.

### Fase 2 (después del MVP)

- Exportar a CSV y a un `registro.md` con el formato del vault, para que el brain mantenga su fuente de verdad (US-21).
- Importar el historial de la planilla actual (US-20).
- Temporizador de descanso, notas ampliadas y análisis semanal automático (US-22).
- Semanas especiales (descarga) y su tipo de cambio aplicable.
- Multiusuario, si lo necesitás: ya existen `app_user` y `user_id`.

## Preguntas abiertas y riesgos

Hay cinco decisiones tuyas que pueden mover el diseño, y siete riesgos con su mitigación.

### Preguntas abiertas

1. **¿Uso personal o multiusuario?** El diseño asume personal, con `user_id` en las tablas para no cerrar la puerta.
2. **¿Las molestias pueden viajar a la API?** Son texto libre de salud. Por defecto no se envían; lo activás en ajustes.
3. **Equipamiento.** El perfil del brain asume que "equipamiento tradicional" incluye barras, mancuernas, rack, bancos regulables, barra de dominadas y paralelas, y lo marca como pendiente de confirmar. Eso define el catálogo y lo que el brain puede proponer.
4. **Modelo y presupuesto.** Qué modelo usar por defecto (`BRAIN_MODEL`) y cuánto estás dispuesto a gastar por mes. Se decide con los tokens reales que dé T3.2.
5. **¿La app pasa a ser la fuente de verdad de la rutina?** Hoy lo es el archivo `rutinas/juan/rutina-2026-10-20.md` del vault. La propuesta es que sí lo sea la app, y que la fase 2 exporte de vuelta al vault.

### Riesgos

| Riesgo | Efecto | Mitigación |
| --- | --- | --- |
| Dos fuentes de verdad (app y vault) | El brain y la app se desfasan | El bundle no lleva `personas/` ni `rutinas/` y la app manda la rutina vigente en cada análisis. La exportación al vault llega en la fase 2 |
| El modelo copia mal una cifra o cita una página que no existe | Una recomendación parece respaldada y no lo está | Validaciones de la sección 5, datos de la app visibles al lado del texto y ningún cambio sin tu aceptación |
| RIR sin registrar o mal estimado | El análisis de proximidad al fallo queda flojo | Las fichas de RIR guardan la serie; el brain baja la confianza si falta; la rutina ya propone calibrar el RIR cada 2 semanas |
| Umbrales de estado arbitrarios | Etiquetas "estancado" o "progresa" equivocadas | Se ajustan en la etapa 4, y el modelo ve también las últimas sesiones, no solo la etiqueta |
| Almacenamiento local en iOS | Se pierden series que no se sincronizaron | Safari puede borrar el almacenamiento de sitios que no se usan durante un tiempo; hasta donde sé, las PWA instaladas quedan exceptuadas. Sincronizar seguido, pedir almacenamiento persistente y probarlo en tu celular en T1.8 |
| La wiki crece o cambia de esquema | El bundle deja de caber, encarece, o el prompt queda desfasado | El build registra la versión del esquema que figura al final de `CLAUDE.md` (hoy 6) y avisa si cambió; `prompt_version` y `brain_version` quedan en cada análisis. Si el bundle crece demasiado, pasar a la opción (c) |
| Datos de salud hacia un tercero | Privacidad | Opt-in para las molestias, perfil sin nombre ni correo y revisión de los términos de uso de datos de la API antes de activarlo |
