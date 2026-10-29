// Números y textos como se leen en castellano: coma decimal y sin ceros de más.

import type { RoutineDayExercise } from '../db/types'

const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })
const oneDecimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })

export const kg = (value: number): string => number.format(value)

export const decimal = (value: number): string => oneDecimal.format(value)

/** "80×8" */
export const setText = (weightKg: number, reps: number): string => `${kg(weightKg)}×${reps}`

/** "6–10", o "8" si los dos son iguales */
export function range(min: number | null, max: number | null): string | null {
  if (min === null) return null
  return max === null || max === min ? `${min}` : `${min}–${max}`
}

function minutes(seconds: number): string {
  return oneDecimal.format(seconds / 60)
}

/** "2–3 min", "1,5 min" */
export function restText(minSec: number | null, maxSec: number | null): string | null {
  if (minSec === null) return null
  if (maxSec === null || maxSec === minSec) return `${minutes(minSec)} min`
  return `${minutes(minSec)}–${minutes(maxSec)} min`
}

/** "3 × 6–10 · RIR 1–2 · desc. 2–3 min" */
export function prescription(item: RoutineDayExercise, sets: number): string {
  return prescriptionParts(item, sets).join(' · ')
}

/** ["3 × 6–10", "RIR 1–2", "desc. 2–3 min"]: lo mismo, en partes sueltas */
export function prescriptionParts(item: RoutineDayExercise, sets: number): string[] {
  const parts = [`${sets} × ${range(item.reps_min, item.reps_max)}`]
  const rir = range(item.rir_min, item.rir_max)
  if (rir) parts.push(`RIR ${rir}`)
  const rest = restText(item.rest_min_sec, item.rest_max_sec)
  if (rest) parts.push(`desc. ${rest}`)
  return parts
}
