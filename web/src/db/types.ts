// Las mismas filas que maneja la API (api/app/schemas_sync.py y schemas.py).

/** Fecha y hora ISO 8601 en UTC, como la da toISOString(). */
export type Iso = string
/** Día local AAAA-MM-DD. */
export type LocalDate = string

export interface SyncRow {
  id: string
  updated_at: Iso
  deleted_at: Iso | null
}

export interface Session extends SyncRow {
  routine_id: string | null
  routine_day_id: string | null
  date: LocalDate
  started_at: Iso | null
  ended_at: Iso | null
  sleep_hours: number | null
  discomfort: string | null
}

export interface SetLog extends SyncRow {
  session_id: string
  exercise_id: string
  /** null = serie fuera de rutina */
  routine_day_exercise_id: string | null
  set_number: number
  weight_kg: number
  reps: number
  /** null si no se anotó */
  rir: number | null
  /** Primer toque -> confirmación; mide la meta de 5 s */
  interaction_ms: number | null
  logged_at: Iso
}

export interface BodyWeight extends SyncRow {
  date: LocalDate
  kg: number
}

export interface ExerciseMuscle {
  muscle_id: string
  /** 1 directa, 0,5 indirecta */
  factor: number
}

export interface Exercise extends SyncRow {
  name: string
  brain_page: string | null
  kind: 'multiarticular' | 'aislamiento' | null
  e1rm_eligible: boolean
  muscles: ExerciseMuscle[]
}

export interface RoutineDayExercise {
  id: string
  exercise_id: string
  position: number
  target_sets: number
  reps_min: number
  reps_max: number
  rir_min: number | null
  rir_max: number | null
  rest_min_sec: number | null
  rest_max_sec: number | null
  ramp_sets: number | null
  ramp_weeks: number | null
  note: string | null
}

export interface RoutineDay {
  id: string
  name: string
  /** 1 = lunes; null si no tiene día fijo */
  weekday: number | null
  position: number
  exercises: RoutineDayExercise[]
}

export interface MuscleTarget {
  muscle_id: string
  target_sets: number
  fractional_target: number | null
  range_min: number | null
  range_max: number | null
  priority: 'alta' | 'media' | 'mantenimiento' | null
}

export interface Routine {
  id: string
  version: number
  status: 'vigente' | 'historica'
  source: 'importada' | 'manual' | 'brain' | null
  parent_routine_id: string | null
  /** El análisis cuyo cambio la creó. Las versiones bajadas antes de PR-29 no lo traen. */
  from_analysis_id?: string | null
  start_on: LocalDate | null
  review_on: LocalDate | null
  days: RoutineDay[]
  muscle_targets: MuscleTarget[]
}

export interface Profile {
  sex: string | null
  birth_year: number | null
  height_cm: number | null
  experience_years: number | null
  habitual_rir: number | null
  goal: string | null
  priority_muscles: string[] | null
  phase: 'definicion' | 'volumen' | 'mantenimiento' | null
  phase_start: LocalDate | null
  phase_target: string | null
  equipment: string | null
  limitations: string | null
  weight_step_kg: number
  send_discomfort_to_ai: boolean
  updated_at: Iso
}

export interface Muscle {
  id: string
  name: string
  parent_id: string | null
}

/** Tablas que se escriben en el celular y suben con push. */
export interface SyncRows {
  sessions: Session
  set_logs: SetLog
  body_weights: BodyWeight
  exercises: Exercise
}

export type SyncTable = keyof SyncRows

export interface OutboxEntry {
  /** `${table}:${rowId}`: una entrada por fila, aunque se edite varias veces */
  key: string
  table: SyncTable
  rowId: string
  queuedAt: Iso
}
