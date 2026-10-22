// Cálculos de la app. El brain interpreta; las cuentas las hace la app (diseño, sección 3).
// La API tiene las mismas funciones en Python (PR-25), validadas con los mismos fixtures.

import type { LocalDate, RoutineDayExercise, Session, SetLog } from '../db/types'
import { parseLocalDate } from '../lib/dates'

/** Con más repeticiones, la fórmula de Epley pierde precisión: esas series no estiman 1RM. */
export const E1RM_MAX_REPS = 12

/** 1RM estimado (Epley): peso × (1 + reps / 30). null si el ejercicio o la serie no sirven. */
export function estimateOneRm(weightKg: number, reps: number, eligible: boolean): number | null {
  if (!eligible || reps <= 0 || reps > E1RM_MAX_REPS) return null
  return weightKg * (1 + reps / 30)
}

export interface SessionSets {
  session: Session
  sets: SetLog[]
}

const alive = <T extends { deleted_at: string | null }>(rows: T[]) =>
  rows.filter((r) => !r.deleted_at)

function sessionOrder(a: Session, b: Session): number {
  return a.date.localeCompare(b.date) || (a.started_at ?? '').localeCompare(b.started_at ?? '')
}

/**
 * Agrupa las series de un ejercicio por sesión, de la más vieja a la más nueva. Ignora lo
 * borrado y las sesiones borradas.
 */
export function groupBySession(sets: SetLog[], sessions: Map<string, Session>): SessionSets[] {
  const groups = new Map<string, SessionSets>()
  for (const set of alive(sets)) {
    const session = sessions.get(set.session_id)
    if (!session || session.deleted_at) continue
    const group = groups.get(session.id) ?? { session, sets: [] }
    group.sets.push(set)
    groups.set(session.id, group)
  }
  return [...groups.values()]
    .map((g) => ({ ...g, sets: g.sets.sort((a, b) => a.set_number - b.set_number) }))
    .sort((a, b) => sessionOrder(a.session, b.session))
}

/** Las series de la última sesión anterior a la actual. */
export function lastTime(history: SessionSets[], currentSessionId: string): SessionSets | null {
  const previous = history.filter((g) => g.session.id !== currentSessionId)
  return previous.at(-1) ?? null
}

export interface BestMark {
  set: SetLog
  /** null en ejercicios sin 1RM estimado (dominadas y otros con peso corporal) */
  e1rm: number | null
}

/**
 * Mejor marca: la serie con el mayor 1RM estimado (12 repeticiones o menos). En los ejercicios
 * sin 1RM estimado, la de más peso y, a igual peso, la de más repeticiones.
 */
export function bestMark(history: SessionSets[], eligible: boolean): BestMark | null {
  let best: BestMark | null = null
  for (const { sets } of history) {
    for (const set of sets) {
      if (!eligible) {
        if (!best || compareSets(set, best.set, false) === 'up') best = { set, e1rm: null }
        continue
      }
      const e1rm = estimateOneRm(set.weight_kg, set.reps, eligible)
      if (e1rm !== null && (!best?.e1rm || e1rm > best.e1rm)) best = { set, e1rm }
    }
  }
  return best
}

/**
 * Peso y repeticiones para precargar la serie N: los de la misma serie de la última vez, o los
 * de su última serie si esa vez hizo menos. El RIR no se precarga nunca: tiene que ser una
 * respuesta, porque el brain saca conclusiones de ese dato.
 */
export function prefill(
  setNumber: number,
  last: SessionSets | null,
): { weight_kg: number; reps: number } | null {
  if (!last || last.sets.length === 0) return null
  const same = last.sets.find((s) => s.set_number === setNumber) ?? last.sets.at(-1)!
  return { weight_kg: same.weight_kg, reps: same.reps }
}

export type Trend = 'up' | 'same' | 'down'

/**
 * Compara una serie con la misma de la última vez. Con 1RM estimado compara eso; si no (más de
 * 12 repeticiones o peso corporal), compara peso y después repeticiones.
 */
export function compareSets(
  current: Pick<SetLog, 'weight_kg' | 'reps'>,
  previous: Pick<SetLog, 'weight_kg' | 'reps'>,
  eligible: boolean,
): Trend {
  const a = estimateOneRm(current.weight_kg, current.reps, eligible)
  const b = estimateOneRm(previous.weight_kg, previous.reps, eligible)
  const diff =
    a !== null && b !== null
      ? a - b
      : current.weight_kg - previous.weight_kg || current.reps - previous.reps
  if (Math.abs(diff) < 1e-9) return 'same'
  return diff > 0 ? 'up' : 'down'
}

/** Semana de la rutina (1 = la semana en que empezó), contando desde start_on. */
export function routineWeek(startOn: LocalDate | null, today: LocalDate): number {
  if (!startOn) return Number.POSITIVE_INFINITY
  const days = Math.floor(
    (parseLocalDate(today).getTime() - parseLocalDate(startOn).getTime()) / 86_400_000,
  )
  return Math.floor(days / 7) + 1
}

/** Series objetivo de la semana: las de rampa mientras dura, y después las de la rutina. */
export function targetSets(
  item: Pick<RoutineDayExercise, 'target_sets' | 'ramp_sets' | 'ramp_weeks'>,
  week: number,
): number {
  if (item.ramp_sets && item.ramp_weeks && week <= item.ramp_weeks) return item.ramp_sets
  return item.target_sets
}
