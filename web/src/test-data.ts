// Datos de prueba: una versión chica de la rutina importada.

import type { Exercise, Routine, RoutineDayExercise } from './db/types'

export const STAMP = '2026-10-19T12:00:00.000Z'

export function exercise(id: string, name: string, muscles: Record<string, number> = {}): Exercise {
  return {
    id,
    name,
    brain_page: null,
    kind: 'multiarticular',
    e1rm_eligible: true,
    muscles: Object.entries(muscles).map(([muscle_id, factor]) => ({ muscle_id, factor })),
    updated_at: STAMP,
    deleted_at: null,
  }
}

export const EXERCISES: Exercise[] = [
  exercise('ex-banca', 'Press de banca con barra', { pectoral: 1, triceps: 0.5 }),
  exercise('ex-remo', 'Remo en T', { espalda: 1, biceps: 0.5 }),
  exercise('ex-prensa', 'Prensa', { cuadriceps: 1, gluteos: 0.5 }),
]

function item(id: string, exerciseId: string, extra: Partial<RoutineDayExercise> = {}) {
  return {
    id,
    exercise_id: exerciseId,
    position: 1,
    target_sets: 3,
    reps_min: 6,
    reps_max: 10,
    rir_min: 1,
    rir_max: 2,
    rest_min_sec: 120,
    rest_max_sec: 180,
    ramp_sets: null,
    ramp_weeks: null,
    note: null,
    ...extra,
  }
}

export function routine(extra: Partial<Routine> = {}): Routine {
  return {
    id: 'r1',
    version: 1,
    status: 'vigente',
    source: 'importada',
    parent_routine_id: null,
    start_on: '2026-10-19',
    review_on: '2026-11-16',
    days: [
      {
        id: 'd-torso',
        name: 'Torso',
        weekday: 1,
        position: 1,
        exercises: [item('rde-banca', 'ex-banca'), item('rde-remo', 'ex-remo', { position: 2 })],
      },
      {
        id: 'd-pierna',
        name: 'Pierna A',
        weekday: 2,
        position: 2,
        exercises: [item('rde-prensa', 'ex-prensa')],
      },
    ],
    muscle_targets: [],
    ...extra,
  }
}
