import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import { AuthContext } from '../auth/context'
import { db } from '../db/db'
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

test('el lunes propone Torso y Empezar crea la sesión con un toque', async () => {
  await seed()
  renderHoy()

  expect(await screen.findByRole('heading', { name: 'Torso' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Empezar' }))

  const [session] = await db.sessions.toArray()
  expect(session).toMatchObject({ routine_id: 'r1', routine_day_id: 'd-torso', date: '2026-10-19' })
  expect(await screen.findByText(`Sesión ${session!.id}`)).toBeInTheDocument()
  expect(await db.outbox.count()).toBe(1)
})

test('si hay una sesión abierta de hoy, la retoma', async () => {
  await seed()
  await db.sessions.put({
    id: 's-abierta',
    routine_id: 'r1',
    routine_day_id: 'd-torso',
    date: '2026-10-19',
    started_at: '2026-10-19T21:00:00.000Z',
    ended_at: null,
    sleep_hours: null,
    discomfort: null,
    updated_at: '2026-10-19T21:00:00.000Z',
    deleted_at: null,
  })
  renderHoy()

  await userEvent.click(await screen.findByRole('button', { name: 'Seguir la sesión' }))

  expect(await screen.findByText('Sesión s-abierta')).toBeInTheDocument()
})

test('se puede elegir otra sesión', async () => {
  await seed()
  renderHoy()

  await userEvent.click(await screen.findByRole('button', { name: 'Elegir otra sesión' }))
  await userEvent.click(screen.getByRole('button', { name: /Pierna A/ }))

  expect((await db.sessions.toArray())[0]?.routine_day_id).toBe('d-pierna')
})

test('el sábado es día de descanso, pero se puede entrenar igual', async () => {
  vi.setSystemTime(SATURDAY)
  await seed()
  renderHoy()

  expect(await screen.findByRole('heading', { name: 'Hoy es día de descanso' })).toBeInTheDocument()
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
