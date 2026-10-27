// Cuentas de la pantalla Hoy: el resumen de un día de la rutina y la semana en curso.

import type { LocalDate, Routine, RoutineDay } from '../db/types'
import { targetSets, weekStart } from '../metrics'
import { addDays } from './calendar'

/** Lo que tarda una serie, sin el descanso */
const WORK_SEC = 45
/** El descanso de un ejercicio que no lo trae */
const DEFAULT_REST_SEC = 120

export interface DaySummary {
  exercises: number
  sets: number
  /** Estimado con las series y el descanso medio de cada ejercicio, redondeado a 5 min */
  minutes: number
}

export function daySummary(day: RoutineDay, week: number): DaySummary {
  let sets = 0
  let seconds = 0
  for (const item of day.exercises) {
    const n = targetSets(item, week)
    const rest =
      item.rest_min_sec === null
        ? DEFAULT_REST_SEC
        : (item.rest_min_sec + (item.rest_max_sec ?? item.rest_min_sec)) / 2
    sets += n
    seconds += n * (WORK_SEC + rest)
  }
  return { exercises: day.exercises.length, sets, minutes: Math.round(seconds / 300) * 5 }
}

/** "~55 min", "~1 h 15 min" */
export function durationText(minutes: number): string {
  if (minutes < 60) return `~${minutes} min`
  const rest = minutes % 60
  return `~${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ''}`
}

/** El próximo día con día fijo después de hoy, dando la vuelta a la semana. */
export function nextPlannedDay(routine: Routine, weekday: number): RoutineDay | undefined {
  const planned = routine.days.filter((d) => d.weekday !== null)
  const after = (d: RoutineDay) => (d.weekday! - weekday + 7) % 7 || 7
  return planned.sort((a, b) => after(a) - after(b))[0]
}

/** Los siete días, de lunes a domingo, de la semana de una fecha. */
export function weekDates(today: LocalDate): LocalDate[] {
  const monday = weekStart(today)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}
