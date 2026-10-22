import type { SetLog } from '../db/types'
import { newId, nowIso, saveRow, softDelete } from '../db/write'

export interface SetValues {
  weight_kg: number
  reps: number
  rir: number | null
}

export interface NewSet extends SetValues {
  sessionId: string
  exerciseId: string
  /** null = fuera de rutina */
  routineDayExerciseId: string | null
  setNumber: number
  interactionMs: number | null
}

/** Guarda una serie en el celular. Resuelve cuando ya está en disco. */
export function logSet(set: NewSet): Promise<SetLog> {
  return saveRow('set_logs', {
    id: newId(),
    session_id: set.sessionId,
    exercise_id: set.exerciseId,
    routine_day_exercise_id: set.routineDayExerciseId,
    set_number: set.setNumber,
    weight_kg: set.weight_kg,
    reps: set.reps,
    rir: set.rir,
    interaction_ms: set.interactionMs,
    logged_at: nowIso(),
    deleted_at: null,
  })
}

export function updateSet(set: SetLog, values: SetValues): Promise<SetLog> {
  return saveRow('set_logs', { ...set, ...values })
}

export function deleteSet(set: SetLog): Promise<SetLog> {
  return softDelete('set_logs', set)
}

/** Deshacer un borrado: la fila vuelve con un updated_at nuevo, así gana en la sincronización. */
export function restoreSet(set: SetLog): Promise<SetLog> {
  return saveRow('set_logs', { ...set, deleted_at: null })
}
