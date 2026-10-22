import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { db } from '../db/db'
import type { Session, SetLog } from '../db/types'
import { exercise, STAMP } from '../test-data'
import ProgressPage from './ProgressPage'

function session(id: string, date: string): Session {
  return {
    id,
    routine_id: null,
    routine_day_id: null,
    date,
    started_at: `${date}T21:00:00.000Z`,
    ended_at: null,
    sleep_hours: null,
    discomfort: null,
    updated_at: STAMP,
    deleted_at: null,
  }
}

function set(
  sessionId: string,
  exerciseId: string,
  n: number,
  weight: number,
  reps: number,
): SetLog {
  return {
    id: `${sessionId}-${exerciseId}-${n}`,
    session_id: sessionId,
    exercise_id: exerciseId,
    routine_day_exercise_id: null,
    set_number: n,
    weight_kg: weight,
    reps,
    rir: 2,
    interaction_ms: null,
    logged_at: STAMP,
    updated_at: STAMP,
    deleted_at: null,
  }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 22, 12, 0))
  await db.exercises.bulkPut([
    exercise('ex-banca', 'Press de banca con barra'),
    { ...exercise('ex-dominadas', 'Dominadas'), e1rm_eligible: false },
    exercise('ex-sin-series', 'Curl con mancuernas'),
  ])
  await db.sessions.bulkPut([
    session('agosto', '2026-08-10'),
    session('s1', '2026-10-12'),
    session('s2', '2026-10-19'),
  ])
  await db.set_logs.bulkPut([
    set('agosto', 'ex-banca', 1, 75, 8),
    set('s1', 'ex-banca', 1, 80, 8),
    set('s1', 'ex-banca', 2, 80, 7),
    set('s2', 'ex-banca', 1, 80, 9),
    set('s2', 'ex-banca', 2, 80, 8),
    set('s2', 'ex-dominadas', 1, 10, 6),
  ])
})

async function chooseBench() {
  await userEvent.selectOptions(
    await screen.findByRole('combobox', { name: 'Ejercicio' }),
    'Press de banca con barra',
  )
}

test('solo ofrece ejercicios con series; sin 1RM arranca en peso máximo', async () => {
  render(<ProgressPage />)

  const select = await screen.findByRole('combobox', { name: 'Ejercicio' })
  expect(
    within(select)
      .getAllByRole('option')
      .map((o) => o.textContent),
  ).toEqual(['Dominadas', 'Press de banca con barra'])
  expect(screen.getByRole('heading', { name: 'Peso máximo (kg)' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '1RM est.' })).toBeDisabled()
})

test('las sesiones del rango, con el indicador contra la anterior', async () => {
  render(<ProgressPage />)
  await chooseBench()

  expect(screen.getByRole('heading', { name: '1RM estimado (kg)' })).toBeInTheDocument()
  const sessions = within(screen.getByRole('list', { name: 'Sesiones' })).getAllByRole('button')
  // 4 semanas: queda afuera la de agosto
  expect(sessions).toHaveLength(2)
  expect(sessions[0]).toHaveTextContent('80×9 80×8')
  expect(within(sessions[0]!).getByLabelText('mejora')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Todo' }))
  expect(
    within(screen.getByRole('list', { name: 'Sesiones' })).getAllByRole('button'),
  ).toHaveLength(3)
})

test('tocar una sesión muestra su detalle', async () => {
  render(<ProgressPage />)
  await chooseBench()

  await userEvent.click(screen.getByRole('button', { name: /lun 19 oct/ }))

  const detail = screen.getByRole('region', { name: 'Sesión del lun 19 oct' })
  expect(detail).toHaveTextContent('Serie 1: 80 kg × 9 · RIR 2')
  expect(detail).toHaveTextContent('1RM ≈ 104 kg')
})

test('cambia de métrica', async () => {
  render(<ProgressPage />)
  await chooseBench()

  await userEvent.click(screen.getByRole('button', { name: 'Volumen' }))

  expect(screen.getByRole('heading', { name: 'Volumen (kg × reps)' })).toBeInTheDocument()
})
