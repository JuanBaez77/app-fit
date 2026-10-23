import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { db } from '../db/db'
import type { MuscleTarget, Session, SetLog } from '../db/types'
import { EXERCISES, routine, STAMP } from '../test-data'
import MuscleVolume from './MuscleVolume'

function target(muscle_id: string, extra: Partial<MuscleTarget>): MuscleTarget {
  return {
    muscle_id,
    target_sets: 0,
    fractional_target: null,
    range_min: null,
    range_max: null,
    priority: null,
    ...extra,
  }
}

function session(id: string, date: string): Session {
  return {
    id,
    routine_id: 'r1',
    routine_day_id: null,
    date,
    started_at: null,
    ended_at: null,
    sleep_hours: null,
    discomfort: null,
    updated_at: STAMP,
    deleted_at: null,
  }
}

function sets(sessionId: string, exerciseId: string, count: number): SetLog[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${sessionId}-${exerciseId}-${i + 1}`,
    session_id: sessionId,
    exercise_id: exerciseId,
    routine_day_exercise_id: null,
    set_number: i + 1,
    weight_kg: 80,
    reps: 8,
    rir: 2,
    interaction_ms: null,
    logged_at: STAMP,
    updated_at: STAMP,
    deleted_at: null,
  }))
}

beforeEach(async () => {
  // Jueves: la semana va del lunes 19 al domingo 25
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 22, 12, 0))
  await db.routines.put(
    routine({
      muscle_targets: [
        target('pectoral', {
          target_sets: 12,
          fractional_target: 12,
          range_min: 10,
          range_max: 14,
          priority: 'alta',
        }),
        target('triceps', { target_sets: 6, fractional_target: 10.5 }),
      ],
    }),
  )
  await db.exercises.bulkPut(EXERCISES)
  await db.muscles.bulkPut([
    { id: 'pectoral', name: 'Pectoral', parent_id: null },
    { id: 'triceps', name: 'Tríceps', parent_id: null },
  ])
  await db.sessions.bulkPut([session('s0', '2026-10-13'), session('s1', '2026-10-19')])
  await db.set_logs.bulkPut([
    ...sets('s0', 'ex-banca', 2),
    ...sets('s1', 'ex-banca', 3),
    ...sets('s1', 'ex-remo', 2),
  ])
})

const rows = async () =>
  within(await screen.findByRole('list', { name: 'Músculos' }))
    .getAllByRole('button')
    .map((b) => b.textContent)

test('series fraccionales de la semana contra la tabla de la rutina', async () => {
  render(<MuscleVolume />)

  // Primero los de la tabla, en su orden; después los que tuvieron series sin meta
  expect(await rows()).toEqual(['Pectoral3 de 12', 'Tríceps1,5 de 10,5', 'biceps1', 'espalda2'])
  expect(screen.getByText('Esta semana')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Semana siguiente' })).toBeDisabled()
})

test('la semana anterior', async () => {
  render(<MuscleVolume />)
  await rows()

  await userEvent.click(screen.getByRole('button', { name: 'Semana anterior' }))

  expect(screen.getByText('Semana del lun 12 oct')).toBeInTheDocument()
  expect(await rows()).toEqual(['Pectoral2 de 12', 'Tríceps1 de 10,5'])
})

test('tocar un músculo muestra qué ejercicios aportaron y la tendencia', async () => {
  render(<MuscleVolume />)
  await rows()

  await userEvent.click(screen.getByRole('button', { name: /Tríceps/ }))

  const detail = screen.getByRole('region', { name: 'Detalle de Tríceps' })
  expect(detail).toHaveTextContent('Directas: 0')
  expect(detail).toHaveTextContent('Press de banca con barra: 3 series × 0,5 = 1,5')
  const weeks = within(detail).getAllByRole('listitem').slice(-2)
  expect(weeks.map((w) => w.textContent)).toEqual(['lun 12 oct1', 'lun 19 oct1,5'])
})

test('el detalle muestra las directas con el rango y la prioridad', async () => {
  render(<MuscleVolume />)
  await rows()

  await userEvent.click(screen.getByRole('button', { name: /Pectoral/ }))

  expect(screen.getByRole('region', { name: 'Detalle de Pectoral' })).toHaveTextContent(
    'Directas: 3 · rango 10–14 · prioridad alta',
  )
})
