import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import { db } from '../db/db'
import type { Session } from '../db/types'
import { routine, STAMP } from '../test-data'
import CalendarPage from './CalendarPage'

function session(id: string, date: string, day: string): Session {
  return {
    id,
    routine_id: 'r1',
    routine_day_id: day,
    date,
    started_at: `${date}T21:00:00.000Z`,
    ended_at: `${date}T22:00:00.000Z`,
    sleep_hours: null,
    discomfort: null,
    updated_at: STAMP,
    deleted_at: null,
  }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 22, 12, 0))
  await db.routines.put(routine({ start_on: '2026-10-19' }))
  await db.sessions.bulkPut([
    session('s1', '2026-10-19', 'd-torso'),
    session('s2', '2026-10-21', 'd-pierna'),
  ])
  await db.set_logs.bulkPut(
    ['s1', 's1', 's2'].map((sessionId, i) => ({
      id: `set-${i}`,
      session_id: sessionId,
      exercise_id: i === 2 ? 'ex-prensa' : 'ex-banca',
      routine_day_exercise_id: null,
      set_number: i + 1,
      weight_kg: 80,
      reps: 8,
      rir: 2,
      interaction_ms: null,
      logged_at: STAMP,
      updated_at: STAMP,
      deleted_at: null,
    })),
  )
})

function renderCalendar() {
  return render(
    <MemoryRouter>
      <CalendarPage />
    </MemoryRouter>,
  )
}

test('marca los días entrenados y los planificados que no se hicieron', async () => {
  renderCalendar()

  expect(
    await screen.findByRole('button', { name: /lun 19 oct: entrenado, Torso/ }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: /mar 20 oct: planificado y no hecho/ }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: /mié 21 oct: entrenado, Pierna A/ }),
  ).toBeInTheDocument()
  expect(screen.getByText('2 de 2 sesiones')).toBeInTheDocument()
})

test('tocar un día muestra su sesión y deja cambiarle la fecha', async () => {
  renderCalendar()

  await userEvent.click(await screen.findByRole('button', { name: /lun 19 oct/ }))
  expect(await screen.findByText('1 ejercicio · 2 series')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Cambiar la fecha' }))
  const input = screen.getByLabelText('Fecha')
  await userEvent.clear(input)
  await userEvent.type(input, '2026-10-20')
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

  await vi.waitFor(async () => expect((await db.sessions.get('s1'))?.date).toBe('2026-10-20'))
  expect(await db.outbox.get('sessions:s1')).toBeDefined()
})

test('navega entre meses', async () => {
  renderCalendar()

  await userEvent.click(await screen.findByRole('button', { name: 'Mes siguiente' }))

  expect(screen.getByText(/nov/)).toBeInTheDocument()
})

test('después de editar la rutina, las sesiones viejas conservan el nombre de su día', async () => {
  const v1 = routine({ start_on: '2026-10-19', status: 'historica' })
  await db.routines.bulkPut([
    v1,
    routine({
      id: 'r2',
      version: 2,
      start_on: '2026-10-19',
      days: v1.days.map((d) => ({ ...d, id: `${d.id}-v2` })),
    }),
  ])
  renderCalendar()

  expect(
    await screen.findByRole('button', { name: /lun 19 oct: entrenado, Torso/ }),
  ).toBeInTheDocument()
})
