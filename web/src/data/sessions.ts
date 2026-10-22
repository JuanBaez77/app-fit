import type { Routine, RoutineDay, Session } from '../db/types'
import { newId, nowIso, saveRow } from '../db/write'
import { localDate } from '../lib/dates'

/** Crea la sesión de hoy para un día de la rutina. Se guarda en el celular: anda sin red. */
export function startSession(routine: Routine, day: RoutineDay): Promise<Session> {
  return saveRow('sessions', {
    id: newId(),
    routine_id: routine.id,
    routine_day_id: day.id,
    date: localDate(),
    started_at: nowIso(),
    ended_at: null,
    sleep_hours: null,
    discomfort: null,
    deleted_at: null,
  })
}
