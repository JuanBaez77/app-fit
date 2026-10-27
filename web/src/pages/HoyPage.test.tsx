import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import { AuthContext } from '../auth/context'
import { db } from '../db/db'
import type { Session, SetLog } from '../db/types'
import { json, mockFetch } from '../test-utils'
import { EXERCISES, routine } from '../test-data'
import HoyPage from './HoyPage'

const MONDAY = new Date(2026, 9, 19, 18, 0)
const SATURDAY = new Date(2026, 9, 24, 11, 0)

function SessionStub() {
  return <p>Sesión {useParams().id}</p>
}

function renderHoy() {
  const auth = {
    state: { status: 'authenticated' as const, user: { id: 'u1', email: 'a@b.c' }, offline: false },
    signIn: vi.fn(),
    signOut: vi.fn(),
  }
  return render(
    <AuthContext value={auth}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<HoyPage />} />
          <Route path="/sesion/:id" element={<SessionStub />} />
        </Routes>
      </MemoryRouter>
    </AuthContext>,
  )
}

beforeEach(() => {
  // Solo la fecha: IndexedDB necesita los timers reales
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(MONDAY)
})

async function seed() {
  await db.routines.put(routine())
  await db.exercises.bulkPut(EXERCISES)
}

function session(extra: Partial<Session> = {}): Session {
  return {
    id: 's1',
    routine_id: 'r1',
    routine_day_id: 'd-torso',
    date: '2026-10-19',
    started_at: '2026-10-19T21:00:00.000Z',
    ended_at: null,
    sleep_hours: null,
    discomfort: null,
    updated_at: '2026-10-19T21:00:00.000Z',
    deleted_at: null,
    ...extra,
  }
}

function set(id: string, sessionId: string): SetLog {
  return {
    id,
    session_id: sessionId,
    exercise_id: 'ex-banca',
    routine_day_exercise_id: 'rde-banca',
    set_number: 1,
    weight_kg: 80,
    reps: 8,
    rir: 2,
    interaction_ms: null,
    logged_at: '2026-10-19T21:05:00.000Z',
    updated_at: '2026-10-19T21:05:00.000Z',
    deleted_at: null,
  }
}

test('el lunes propone Torso y Empezar crea la sesión con un toque', async () => {
  await seed()
  renderHoy()

  expect(await screen.findByRole('heading', { name: 'Torso' })).toBeInTheDocument()
  expect(screen.getByText('6 series')).toBeInTheDocument()
  expect(screen.getByText('Press de banca con barra')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Empezar' }))

  const [session] = await db.sessions.toArray()
  expect(session).toMatchObject({ routine_id: 'r1', routine_day_id: 'd-torso', date: '2026-10-19' })
  expect(await screen.findByText(`Sesión ${session!.id}`)).toBeInTheDocument()
  expect(await db.outbox.count()).toBe(1)
})

test('si hay una sesión abierta de hoy, la retoma y muestra cuánto lleva', async () => {
  await seed()
  await db.sessions.put(session({ id: 's-abierta' }))
  await db.set_logs.bulkPut([set('set-1', 's-abierta'), set('set-2', 's-abierta')])
  renderHoy()

  expect(await screen.findByRole('progressbar', { name: 'Series hechas' })).toHaveAttribute(
    'aria-valuenow',
    '2',
  )
  expect(screen.getByText(/2 de 6 series/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Seguir la sesión' }))

  expect(await screen.findByText('Sesión s-abierta')).toBeInTheDocument()
})

test('elegir otra sesión la lleva a la tarjeta, y Empezar la crea', async () => {
  await seed()
  renderHoy()

  await userEvent.click(await screen.findByRole('button', { name: /Pierna A/ }))
  expect(await screen.findByRole('heading', { name: 'Pierna A' })).toBeInTheDocument()
  expect(await db.sessions.count()).toBe(0)
  await userEvent.click(screen.getByRole('button', { name: 'Empezar' }))

  expect((await db.sessions.toArray())[0]?.routine_day_id).toBe('d-pierna')
})

test('la sesión ya hecha hoy se puede repetir', async () => {
  await seed()
  await db.sessions.put(session({ ended_at: '2026-10-19T22:00:00.000Z' }))
  renderHoy()

  expect(await screen.findByText('Ya la hiciste hoy')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Hacerla de nuevo' })).toBeInTheDocument()
})

test('la semana marca los días entrenados y los planificados que faltaron', async () => {
  vi.setSystemTime(new Date(2026, 9, 21, 18, 0))
  await seed()
  await db.sessions.put(session())
  await db.set_logs.put(set('set-1', 's1'))
  renderHoy()

  expect(await screen.findByRole('listitem', { name: 'lunes 19, entrenado' })).toBeInTheDocument()
  expect(screen.getByRole('listitem', { name: 'martes 20, sin entrenar' })).toBeInTheDocument()
  expect(screen.getByRole('listitem', { name: 'miércoles 21, hoy, descanso' })).toBeInTheDocument()
})

test('el sábado es día de descanso, pero se puede entrenar igual', async () => {
  vi.setSystemTime(SATURDAY)
  await seed()
  renderHoy()

  expect(await screen.findByRole('heading', { name: 'Hoy es día de descanso' })).toBeInTheDocument()
  expect(screen.getByText('El lunes toca Torso.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Torso/ })).toBeInTheDocument()
})

test('sin rutina, Importar la trae y aparece la sesión del día', async () => {
  await db.meta.put({ key: 'cursor', value: '2026-10-19T00:00:00+00:00' })
  mockFetch({
    'POST /api/routines/import': () => json(routine(), 201),
    'GET /api/sync/pull': () =>
      json({
        cursor: '2026-10-19T21:00:00+00:00',
        sessions: [],
        set_logs: [],
        body_weights: [],
        exercises: EXERCISES,
        routines: [routine()],
        profile: null,
        muscles: [],
      }),
  })
  renderHoy()

  await userEvent.click(await screen.findByRole('button', { name: 'Importar rutina' }))

  expect(await screen.findByRole('heading', { name: 'Torso' })).toBeInTheDocument()
})

test('sin conexión, importar avisa que hace falta internet', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
  renderHoy()

  await userEvent.click(await screen.findByRole('button', { name: 'Importar rutina' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('necesita internet')
})
