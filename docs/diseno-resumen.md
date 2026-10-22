# app-fit — diseño del MVP (resumen)

Documento completo (requisitos, arquitectura, modelo de datos, wireframes, prompt del brain, plan): https://claude.ai/artifact/JPzASUfCUqFu1Yj3MWwUmY

Fecha del diseño: 2026-10-22. Última actualización: 2026-10-22 (base de datos pasa a PostgreSQL).

## Qué es
PWA mobile-first y offline-first para registrar entrenamiento (serie en 5 s o menos, una mano) conectada al "brain de hipertrofia" de Juan (wiki markdown en `C:\second-brain`). El botón "Analizar" manda un resumen de métricas al brain y devuelve diagnóstico y cambios propuestos a la rutina; Juan acepta o rechaza cada uno.

## Decisiones tomadas
- Conexión con el brain: opción (a), API de Claude con el brain empaquetado como system prompt (bloque cacheable). La (b), Proyecto de Claude, no se consulta desde un backend; la (c), búsqueda propia, queda como evolución si la wiki crece.
- Bundle del brain: wiki sin la carpeta de estudios (~171 KB, ~45–50 mil tokens, estimado) + reglas del esquema (§5, §6.7, §10) + `index.md`. No incluye `personas/` ni `rutinas/`: perfil y rutina los manda la app.
- La app calcula (volumen fraccional, 1RM estimado, estado por ejercicio); el brain interpreta. El mapa de factores por ejercicio (directa 1, indirecta 0,5, con las excepciones de la wiki) reproduce las cifras de `rutina-2026-10-20`.
- RIR, no RPE. Las fichas de RIR guardan la serie al tocarlas; el RIR no se precarga.
- Entran al MVP peso corporal, horas de sueño y molestias por sesión (la rutina vigente los pide).
- Stack: React + Vite + TypeScript + Dexie en el cliente; FastAPI + SQLAlchemy + Alembic + PostgreSQL en el servidor (contenedor del docker-compose, o una base nueva en el Postgres del VPS si ya hay uno); nginx. Backup con `pg_dump` en cron.
- Esquema en PostgreSQL: ids `uuid`, fechas `date`/`timestamptz`, JSON en `jsonb`. La tabla de usuarios se llama `app_user` porque `user` es palabra reservada.
- Los cambios aceptados crean una versión nueva de la rutina; la anterior se conserva.
- Uso personal, con `user_id` en las tablas.

## Plan
5 etapas, 30 tareas, ~121 h (estimación gruesa): 0 Cimientos (~13 h), 1 Registro offline, 2 Calendario y progreso, 3 Brain, 4 Uso real. Pista paralela: probar el prompt con la planilla actual (T3.2) antes de construir la app.

## Pendiente de decidir
Multiusuario o no; si las molestias pueden viajar a la API; confirmar el equipamiento; modelo y presupuesto; si la app pasa a ser la fuente de verdad de la rutina.
