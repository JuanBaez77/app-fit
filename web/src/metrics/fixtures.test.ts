// Fixtures dorados compartidos con la API (fixtures/metrics/). Si este test y el de Python pasan
// con los mismos archivos, las dos implementaciones no divergen.

import { describe, expect, test } from 'vitest'
import oneRm from '../../../fixtures/metrics/1rm-estimado.json'
import edges from '../../../fixtures/metrics/bordes-semana.json'
import routineWeek from '../../../fixtures/metrics/rutina-semana-3.json'
import type { Session, SetLog } from '../db/types'
import { bestMark, estimateOneRm, groupBySession, weeklyVolume } from './index'

interface Fixture {
  exercises: {
    id: string
    e1rm_eligible: boolean
    muscles: { muscle_id: string; factor: number }[]
  }[]
  sessions: { id: string; date: string; deleted_at: string | null }[]
  sets: {
    id: string
    session_id: string
    exercise_id: string
    set_number: number
    weight_kg: number
    reps: number
    deleted_at: string | null
  }[]
}

function load(fixture: Fixture) {
  return {
    sets: fixture.sets as unknown as SetLog[],
    sessions: new Map(fixture.sessions.map((s) => [s.id, s as unknown as Session])),
    exercises: new Map(fixture.exercises.map((e) => [e.id, e])),
  }
}

describe.each([
  ['rutina-semana-3', routineWeek],
  ['bordes-semana', edges],
])('volumen semanal: %s', (_name, fixture) => {
  test('coincide con lo esperado', () => {
    const { sets, sessions, exercises } = load(fixture as Fixture)

    const weeks = weeklyVolume(sets, sessions, exercises)

    expect(Object.fromEntries(weeks)).toEqual(
      Object.fromEntries(fixture.expected.weekly_volume.map((w) => [w.week_start, w.muscles])),
    )
  })
})

describe('1RM estimado', () => {
  const { sets, sessions, exercises } = load(oneRm as Fixture)

  test('por serie', () => {
    for (const set of sets) {
      const expected = oneRm.expected.e1rm_by_set[set.id as keyof typeof oneRm.expected.e1rm_by_set]
      const eligible = exercises.get(set.exercise_id)!.e1rm_eligible
      const value = estimateOneRm(set.weight_kg, set.reps, eligible)
      if (expected === null) expect(value).toBeNull()
      else expect(value).toBeCloseTo(expected, 3)
    }
  })

  test('mejor marca por ejercicio', () => {
    for (const [exerciseId, expected] of Object.entries(oneRm.expected.best_e1rm)) {
      const exercise = exercises.get(exerciseId)!
      const history = groupBySession(
        sets.filter((s) => s.exercise_id === exerciseId),
        sessions,
      )
      const best = bestMark(history, exercise.e1rm_eligible)
      if (expected === null) expect(best?.e1rm ?? null).toBeNull()
      else expect(best?.e1rm).toBeCloseTo(expected, 3)
    }
  })
})
