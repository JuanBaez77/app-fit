import type { LocalDate } from '../db/types'

/** Día local AAAA-MM-DD (no UTC: una sesión a las 22 h es de hoy, no de mañana). */
export function localDate(date: Date = new Date()): LocalDate {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 1 = lunes … 7 = domingo, como routine_day.weekday. */
export function isoWeekday(date: Date = new Date()): number {
  return ((date.getDay() + 6) % 7) + 1
}

/** Lee un AAAA-MM-DD como fecha local a medianoche. */
export function parseLocalDate(value: LocalDate): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

export function weekdayName(weekday: number): string {
  return WEEKDAYS[weekday - 1] ?? ''
}

/** "lun 19 oct" */
export function shortDate(value: LocalDate): string {
  return parseLocalDate(value)
    .toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/\./g, '')
    .replace(',', '')
}
