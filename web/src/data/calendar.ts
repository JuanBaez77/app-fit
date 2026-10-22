// Cuentas del calendario (US-12): días entrenados, semanas cumplidas, racha y frecuencia.

import type { LocalDate, Routine, Session } from '../db/types'
import { localDate, parseLocalDate } from '../lib/dates'
import { weekStart } from '../metrics'

/** Una sesión cuenta como entrenada si tiene al menos una serie. */
export function trainedSessions(
  sessions: Session[],
  setsBySession: Map<string, number>,
): Session[] {
  return sessions.filter((s) => !s.deleted_at && (setsBySession.get(s.id) ?? 0) > 0)
}

export function byDate(sessions: Session[]): Map<LocalDate, Session[]> {
  const days = new Map<LocalDate, Session[]>()
  for (const session of sessions)
    days.set(session.date, [...(days.get(session.date) ?? []), session])
  return days
}

/** Días de la semana (1 = lunes) que la rutina tiene planificados. */
export function plannedWeekdays(routine: Routine | null): Set<number> {
  return new Set(routine?.days.flatMap((d) => (d.weekday ? [d.weekday] : [])) ?? [])
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = parseLocalDate(date)
  d.setDate(d.getDate() + days)
  return localDate(d)
}

/** Semanas (lunes a domingo) que cubren un mes; null fuera del mes. */
export function monthGrid(year: number, month: number): (LocalDate | null)[][] {
  const first = localDate(new Date(year, month, 1))
  const weeks: (LocalDate | null)[][] = []
  for (let monday = weekStart(first); ; monday = addDays(monday, 7)) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
    if (parseLocalDate(days[0]!).getMonth() !== month && weeks.length > 0) break
    weeks.push(days.map((d) => (parseLocalDate(d).getMonth() === month ? d : null)))
  }
  return weeks
}

export interface WeekStats {
  thisWeek: { done: number; planned: number }
  /** Semanas seguidas con todas las sesiones planificadas; la semana en curso suma si ya se cumplió */
  streak: number
  /** Sesiones por semana en las 3 semanas completas anteriores */
  averageLast3: number
}

export function weekStats(trained: Session[], planned: number, today: LocalDate): WeekStats {
  const perWeek = new Map<LocalDate, number>()
  for (const session of trained) {
    const week = weekStart(session.date)
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1)
  }
  const current = weekStart(today)
  const done = (week: LocalDate) => perWeek.get(week) ?? 0

  let streak = 0
  if (planned > 0) {
    let week = done(current) >= planned ? current : addDays(current, -7)
    while (done(week) >= planned) {
      streak += 1
      week = addDays(week, -7)
    }
  }
  const last3 = [1, 2, 3].map((n) => done(addDays(current, -7 * n)))

  return {
    thisWeek: { done: done(current), planned },
    streak,
    averageLast3: last3.reduce((a, b) => a + b, 0) / 3,
  }
}

/**
 * ○ planificado y no hecho: un día de la rutina, ya pasado, desde que empezó la rutina, sin
 * sesión entrenada ese día.
 */
export function missedPlanned(
  date: LocalDate,
  routine: Routine | null,
  trainedDates: Set<LocalDate>,
  today: LocalDate,
): boolean {
  if (!routine?.start_on || date < routine.start_on || date >= today) return false
  const weekday = ((parseLocalDate(date).getDay() + 6) % 7) + 1
  return plannedWeekdays(routine).has(weekday) && !trainedDates.has(date)
}
