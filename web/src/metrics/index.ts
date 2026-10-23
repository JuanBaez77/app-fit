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

export interface MuscleVolume {
  /** Series con factor 1 */
  direct: number
  /** Suma de factores: la indirecta vale 0,5 */
  fractional: number
}

/** muscle_id -> volumen. Un músculo sin series en la semana no aparece. */
export type WeeklyVolume = Record<string, MuscleVolume>

type VolumeSet = Pick<SetLog, 'session_id' | 'exercise_id' | 'deleted_at'>
type VolumeSession = Pick<Session, 'date' | 'deleted_at'>
type VolumeExercise = { muscles: { muscle_id: string; factor: number }[] }

/** El lunes de la semana de una fecha local. */
export function weekStart(date: LocalDate): LocalDate {
  const day = parseLocalDate(date)
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7))
  const m = String(day.getMonth() + 1).padStart(2, '0')
  const d = String(day.getDate()).padStart(2, '0')
  return `${day.getFullYear()}-${m}-${d}`
}

/**
 * Volumen por músculo y por semana (lunes a domingo, según la fecha de la sesión), con el mapa
 * de factores de cada ejercicio. No se guarda: cambiar un factor corrige todo el historial.
 */
export function weeklyVolume(
  sets: VolumeSet[],
  sessions: Map<string, VolumeSession>,
  exercises: Map<string, VolumeExercise>,
): Map<LocalDate, WeeklyVolume> {
  const weeks = new Map<LocalDate, WeeklyVolume>()
  for (const set of sets) {
    const session = sessions.get(set.session_id)
    const exercise = exercises.get(set.exercise_id)
    if (set.deleted_at || !session || session.deleted_at || !exercise) continue
    const week = weekStart(session.date)
    const volume = weeks.get(week) ?? {}
    for (const { muscle_id, factor } of exercise.muscles) {
      const current = volume[muscle_id] ?? { direct: 0, fractional: 0 }
      volume[muscle_id] = {
        direct: current.direct + (factor === 1 ? 1 : 0),
        fractional: current.fractional + factor,
      }
    }
    weeks.set(week, volume)
  }
  return weeks
}

export interface SessionPoint {
  sessionId: string
  date: LocalDate
  /** Mayor 1RM estimado de la sesión; null si ninguna serie lo permite */
  e1rm: number | null
  maxWeight: number
  /** Series × repeticiones × peso */
  volume: number
  sets: SetLog[]
}

/** Un punto por sesión para el gráfico de un ejercicio (US-13). */
export function sessionSeries(history: SessionSets[], eligible: boolean): SessionPoint[] {
  return history.map(({ session, sets }) => {
    const e1rms = sets
      .map((s) => estimateOneRm(s.weight_kg, s.reps, eligible))
      .filter((v): v is number => v !== null)
    return {
      sessionId: session.id,
      date: session.date,
      e1rm: e1rms.length ? Math.max(...e1rms) : null,
      maxWeight: Math.max(...sets.map((s) => s.weight_kg)),
      volume: sets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0),
      sets,
    }
  })
}
