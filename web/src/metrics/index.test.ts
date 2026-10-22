import { describe, expect, test } from 'vitest'
import type { Session, SetLog } from '../db/types'
import {
  bestMark,
  compareSets,
  estimateOneRm,
  groupBySession,
  lastTime,
  prefill,
  routineWeek,
  targetSets,
} from './index'

function session(id: string, date: string, extra: Partial<Session> = {}): Session {
  return {
    id,
    routine_id: null,
    routine_day_id: null,
    date,
    started_at: `${date}T21:00:00.000Z`,
    ended_at: null,
    sleep_hours: null,
    discomfort: null,
    updated_at: '',
    deleted_at: null,
    ...extra,
  }
}

function set(
  sessionId: string,
  n: number,
  weight: number,
  reps: number,
  extra: Partial<SetLog> = {},
): SetLog {
  return {
    id: `${sessionId}-${n}`,
    session_id: sessionId,
    exercise_id: 'ex',
    routine_day_exercise_id: null,
    set_number: n,
    weight_kg: weight,
    reps,
    rir: 2,
    interaction_ms: null,
    logged_at: '',
    updated_at: '',
    deleted_at: null,
    ...extra,
  }
}

const SESSIONS = new Map(
  [session('s1', '2026-10-12'), session('s2', '2026-10-19'), session('hoy', '2026-10-22')].map(
    (s) => [s.id, s],
  ),
)

describe('estimateOneRm', () => {
  test('Epley con 12 repeticiones o menos', () => {
    expect(estimateOneRm(80, 8, true)).toBeCloseTo(101.33, 2)
    expect(estimateOneRm(100, 12, true)).toBeCloseTo(140, 5)
  })

  test('null con más de 12 repeticiones o si el ejercicio no sirve', () => {
    expect(estimateOneRm(60, 13, true)).toBeNull()
    expect(estimateOneRm(10, 8, false)).toBeNull()
  })
})

describe('historial', () => {
  const sets = [
    set('s1', 1, 77.5, 8),
    set('s1', 2, 77.5, 7),
    set('s2', 2, 80, 8),
    set('s2', 1, 80, 9),
    set('s2', 3, 80, 7),
    set('s2', 4, 100, 3, { deleted_at: '2026-10-19T22:00:00Z' }),
    set('hoy', 1, 80, 9),
  ]
  const history = groupBySession(sets, SESSIONS)

  test('agrupa por sesión en orden y deja afuera lo borrado', () => {
    expect(history.map((g) => g.session.id)).toEqual(['s1', 's2', 'hoy'])
    expect(history[1]!.sets.map((s) => s.set_number)).toEqual([1, 2, 3])
  })

  test('última vez es la sesión anterior a la actual', () => {
    expect(lastTime(history, 'hoy')?.session.id).toBe('s2')
    expect(lastTime(history, 'otra')?.session.id).toBe('hoy')
  })

  test('la mejor marca es el mayor 1RM estimado, sin contar lo borrado', () => {
    const best = bestMark(history, true)
    expect(best?.set.id).toBe('s2-1')
    expect(best?.e1rm).toBeCloseTo(104, 5)
  })

  test('sin 1RM posible no hay mejor marca', () => {
    expect(bestMark(groupBySession([set('s1', 1, 0, 15)], SESSIONS), true)).toBeNull()
  })

  test('precarga la misma serie de la última vez, o su última serie', () => {
    const last = lastTime(history, 'hoy')
    expect(prefill(2, last)).toEqual({ weight_kg: 80, reps: 8 })
    expect(prefill(5, last)).toEqual({ weight_kg: 80, reps: 7 })
    expect(prefill(1, null)).toBeNull()
  })
})

describe('compareSets', () => {
  test('compara el 1RM estimado', () => {
    expect(compareSets({ weight_kg: 80, reps: 9 }, { weight_kg: 80, reps: 8 }, true)).toBe('up')
    expect(compareSets({ weight_kg: 77.5, reps: 8 }, { weight_kg: 80, reps: 8 }, true)).toBe('down')
    expect(compareSets({ weight_kg: 80, reps: 8 }, { weight_kg: 80, reps: 8 }, true)).toBe('same')
  })

  test('sin 1RM compara peso y después repeticiones', () => {
    expect(compareSets({ weight_kg: 0, reps: 9 }, { weight_kg: 0, reps: 8 }, false)).toBe('up')
    expect(compareSets({ weight_kg: 10, reps: 15 }, { weight_kg: 12.5, reps: 15 }, true)).toBe(
      'down',
    )
  })
})

describe('semana y rampa', () => {
  const item = { target_sets: 3, ramp_sets: 2, ramp_weeks: 2 }

  test('semana de la rutina desde start_on', () => {
    expect(routineWeek('2026-10-20', '2026-10-20')).toBe(1)
    expect(routineWeek('2026-10-20', '2026-11-02')).toBe(2)
    expect(routineWeek('2026-10-20', '2026-11-03')).toBe(3)
  })

  test('rampa en las semanas 1 y 2, la rutina desde la 3', () => {
    expect(targetSets(item, 1)).toBe(2)
    expect(targetSets(item, 2)).toBe(2)
    expect(targetSets(item, 3)).toBe(3)
    expect(targetSets({ target_sets: 4, ramp_sets: null, ramp_weeks: null }, 1)).toBe(4)
  })
})

describe('mejor marca sin 1RM estimado', () => {
  test('dominadas: la de más peso agregado y después más repeticiones', () => {
    const history = groupBySession(
      [set('s1', 1, 0, 10), set('s1', 2, 5, 6), set('s2', 1, 5, 8), set('s2', 2, 2.5, 12)],
      SESSIONS,
    )

    const best = bestMark(history, false)

    expect(best?.set.id).toBe('s2-1')
    expect(best?.e1rm).toBeNull()
  })
})
