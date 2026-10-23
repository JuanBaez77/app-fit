import { expect, test } from 'vitest'
import { routine } from '../test-data'
import type { Routine } from '../db/types'
import { diffVersions } from './versionDiff'

const NAMES: Record<string, string> = {
  'ex-banca': 'Press de banca',
  'ex-remo': 'Remo en T',
  'ex-prensa': 'Prensa',
  'ex-curl': 'Curl',
  'ex-jalon': 'Jalón',
}
const names = {
  exercise: (id: string) => NAMES[id] ?? id,
  muscle: (id: string) => id.replace(/_/g, ' '),
}

const V1 = routine()

function edit(change: (r: Routine) => void): Routine {
  const copy = structuredClone(V1)
  change(copy)
  return copy
}

test('sin cambios no dice nada', () => {
  expect(diffVersions(V1, structuredClone(V1), names)).toEqual([])
})

test('series, repeticiones, RIR y descanso de un ejercicio que sigue', () => {
  const v2 = edit((r) => {
    Object.assign(r.days[0]!.exercises[0]!, {
      target_sets: 4,
      reps_min: 8,
      reps_max: 12,
      rir_min: 0,
      rir_max: 1,
      rest_min_sec: 90,
      rest_max_sec: 120,
    })
  })

  expect(diffVersions(V1, v2, names)).toEqual([
    'Torso · Press de banca: 3 → 4 series, 6–10 → 8–12 repeticiones, RIR 1–2 → 0–1, descanso 2–3 min → 1,5–2 min',
  ])
})

test('agregar, quitar, reemplazar y reordenar', () => {
  const v2 = edit((r) => {
    const [banca, remo] = r.days[0]!.exercises
    // Remo y banca cambian de lugar, y se agrega un curl al final
    r.days[0]!.exercises = [
      { ...remo!, position: 1 },
      { ...banca!, position: 2 },
      { ...banca!, id: 'rde-curl', exercise_id: 'ex-curl', position: 3, target_sets: 2 },
    ]
    // En pierna, la prensa se reemplaza por un jalón (el mismo lugar)
    r.days[1]!.exercises = [{ ...r.days[1]!.exercises[0]!, exercise_id: 'ex-jalon' }]
  })

  expect(diffVersions(V1, v2, names)).toEqual([
    'Torso: se agregó Curl (2 × 6–10 · RIR 1–2 · desc. 2–3 min)',
    'Torso: cambió el orden',
    'Pierna A: Prensa → Jalón',
  ])
})

test('días y metas por músculo', () => {
  const before = routine({
    muscle_targets: [
      {
        muscle_id: 'pectoral',
        target_sets: 12,
        fractional_target: 12,
        range_min: 10,
        range_max: 14,
        priority: 'alta',
      },
      {
        muscle_id: 'triceps',
        target_sets: 6,
        fractional_target: 10.5,
        range_min: 5,
        range_max: 8,
        priority: null,
      },
    ],
  })
  const after = structuredClone(before)
  after.days = after.days.slice(0, 1)
  after.muscle_targets[0]!.target_sets = 14
  after.muscle_targets[1]!.range_max = 9
  after.muscle_targets.push({ ...after.muscle_targets[1]!, muscle_id: 'deltoides_lateral' })

  expect(diffVersions(before, after, names)).toEqual([
    'Se quitó el día Pierna A',
    'Meta de pectoral: 12 → 14 series',
    'Rango de triceps: 5–8 → 5–9',
    'Meta nueva de deltoides lateral: 6 series',
  ])
})
