import { fireEvent, render, screen, within } from '@testing-library/react'
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

/** Cada grupo de la lista con sus filas */
async function groups() {
  await screen.findByRole('list', { name: 'Prioridad alta' })
  return Object.fromEntries(
    screen
      .getAllByRole('list')
      .filter((list) => list.classList.contains('grouped'))
      .map((list) => [
        list.getAttribute('aria-labelledby'),
        within(list)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ]),
  )
}

test('series fraccionales de la semana contra la tabla de la rutina, por prioridad', async () => {
  render(<MuscleVolume />)

  // Los de la tabla, en su orden y agrupados; al final los que tuvieron series sin meta
  expect(await groups()).toEqual({
    'muscles-alta': ['Pectoral3 de 12'],
    'muscles-otros': ['Tríceps1,5 de 10,5'],
    'muscles-sin-meta': ['biceps1', 'espalda2'],
  })
  expect(screen.getByRole('heading', { name: 'Esta semana' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Semana siguiente' })).toBeDisabled()
  expect(screen.getByText('0 de 2')).toBeInTheDocument()
})

test('la semana anterior, y Esta semana para volver', async () => {
  render(<MuscleVolume />)
  await groups()

  await userEvent.click(screen.getByRole('button', { name: 'Semana anterior' }))

  expect(screen.getByRole('heading', { name: '12–18 oct' })).toBeInTheDocument()
  expect(await groups()).toEqual({
    'muscles-alta': ['Pectoral2 de 12'],
    'muscles-otros': ['Tríceps1 de 10,5'],
  })

  await userEvent.click(screen.getByRole('button', { name: 'Esta semana' }))
  expect(screen.getByRole('heading', { name: 'Esta semana' })).toBeInTheDocument()
})

test('deslizar de costado cambia de semana, pero no pasa de esta', async () => {
  render(<MuscleVolume />)
  const area = await screen.findByRole('region', { name: 'Volumen por músculo' })

  fireEvent.pointerDown(area, { clientX: 300, clientY: 100 })
  fireEvent.pointerUp(area, { clientX: 200, clientY: 100 })
  expect(screen.getByRole('heading', { name: 'Esta semana' })).toBeInTheDocument()

  fireEvent.pointerDown(area, { clientX: 100, clientY: 100 })
  fireEvent.pointerUp(area, { clientX: 200, clientY: 100 })
  expect(screen.getByRole('heading', { name: '12–18 oct' })).toBeInTheDocument()
})

test('tocar un músculo muestra qué ejercicios aportaron y la tendencia', async () => {
  render(<MuscleVolume />)
  await groups()

  await userEvent.click(screen.getByRole('button', { name: /Tríceps/ }))

  const detail = screen.getByRole('region', { name: 'Detalle de Tríceps' })
  expect(within(detail).getByText('Directas').nextElementSibling).toHaveTextContent('0')
  expect(within(detail).getByText('Press de banca con barra').nextElementSibling).toHaveTextContent(
    '3 series · cuentan 1,5',
  )
  const weeks = within(detail).getAllByRole('listitem').slice(-2)
  expect(weeks[0]).toHaveTextContent(/^1.*12 oct$/)
  expect(weeks[1]).toHaveTextContent(/^1,5.*19 oct$/)
})

test('el detalle muestra las directas con el rango y la meta', async () => {
  render(<MuscleVolume />)
  await groups()

  await userEvent.click(screen.getByRole('button', { name: /Pectoral/ }))

  const detail = screen.getByRole('region', { name: 'Detalle de Pectoral' })
  const stats = within(detail)
    .getAllByRole('term')
    .map((dt) => `${dt.textContent} ${dt.nextElementSibling?.textContent}`)
  expect(stats).toEqual(['Directas 3', 'Rango 10–14', 'Meta 12'])
  // Las directas no llevan la cuenta de 0,5
  expect(within(detail).getByText('Press de banca con barra').nextElementSibling).toHaveTextContent(
    /^3 series$/,
  )
})
