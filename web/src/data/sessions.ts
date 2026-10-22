import { db } from '../db/db'
import type { LocalDate, Routine, RoutineDay, Session } from '../db/types'
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

export interface SessionClose {
  sleep_hours: number | null
  discomfort: string | null
}

/** Cierra la sesión con las horas de sueño y las molestias, ambas opcionales. */
export function finishSession(session: Session, close: SessionClose): Promise<Session> {
  const discomfort = close.discomfort?.trim() || null
  return saveRow('sessions', {
    ...session,
    ended_at: session.ended_at ?? nowIso(),
    sleep_hours: close.sleep_hours,
    discomfort,
  })
}

/**
 * Las sesiones de días anteriores que quedaron abiertas se cierran solas, con la hora de su
 * última serie. Devuelve cuántas cerró.
 */
export async function closeStaleSessions(today: LocalDate = localDate()): Promise<number> {
  const stale = (await db.sessions.where('date').below(today).toArray()).filter(
    (s) => !s.ended_at && !s.deleted_at,
  )
  for (const session of stale) {
    const sets = (await db.set_logs.where('session_id').equals(session.id).toArray()).filter(
      (s) => !s.deleted_at,
    )
    const lastSet = sets
      .map((s) => s.logged_at)
      .sort()
      .at(-1)
    await saveRow('sessions', { ...session, ended_at: lastSet ?? session.started_at ?? nowIso() })
  }
  return stale.length
}
