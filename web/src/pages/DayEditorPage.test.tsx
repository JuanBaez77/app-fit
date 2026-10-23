import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import { db } from '../db/db'
import { EXERCISES, exercise, routine, STAMP } from '../test-data'
import { json, mockFetch } from '../test-utils'
import DayEditorPage from './DayEditorPage'
import RoutinePage from './RoutinePage'

const V2 = routine({ id: 'r2', version: 2, source: 'manual', parent_routine_id: 'r1' })

beforeEach(async () => {
  await db.routines.put(routine())
  await db.exercises.bulkPut([
    ...EXERCISES,
    exercise('ex-curl', 'Curl con mancuernas', { biceps: 1 }),
    // Sin músculo directo: no se puede contar su volumen
    exercise('ex-fondos', 'Fondos', { triceps: 0.5 }),
    { ...exercise('ex-viejo', 'Borrado', { pectoral: 1 }), deleted_at: STAMP },
  ])
})

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={['/rutina/dia/d-torso']}>
      <Routes>
        <Route path="/rutina" element={<RoutinePage />} />
        <Route path="/rutina/dia/:dayId" element={<DayEditorPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const card = (name: string) => screen.findByRole('listitem', { name })

async function setField(label: string, value: string) {
  const input = screen.getByLabelText(label)
  await userEvent.clear(input)
  if (value) await userEvent.type(input, value)
}

function base(id: string, exerciseId: string, extra: object = {}) {
  return {
    routine_day_exercise_id: id,
    exercise_id: exerciseId,
    target_sets: 3,
    reps_min: 6,
    reps_max: 10,
    rir_min: 1,
    rir_max: 2,
    rest_min_sec: 120,
    rest_max_sec: 180,
    note: null,
    ...extra,
  }
}

test('editar, reordenar y agregar crea la versión 2', async () => {
  let sent: unknown
  mockFetch({
    'POST /api/routines/r1/versions': (init) => {
      sent = JSON.parse(String(init?.body))
      return json(V2, 201)
    },
  })
  renderEditor()

  await card('Press de banca con barra')
  await setField('Series de Press de banca con barra', '4')
  await userEvent.click(screen.getByRole('button', { name: 'Subir Remo en T' }))
  await userEvent.selectOptions(
    screen.getByRole('combobox', { name: 'Agregar ejercicio' }),
    'Curl con mancuernas',
  )
  await userEvent.click(screen.getByRole('button', { name: 'Agregar' }))
  await userEvent.click(screen.getByRole('button', { name: 'Guardar versión 2' }))

  expect(await screen.findByRole('status')).toHaveTextContent('Guardada la versión 2.')
  expect(sent).toEqual({
    days: [
      {
        routine_day_id: 'd-torso',
        exercises: [
          base('rde-remo', 'ex-remo'),
          base('rde-banca', 'ex-banca', { target_sets: 4 }),
          base(null as never, 'ex-curl', { reps_min: 8, reps_max: 12 }),
        ],
      },
    ],
  })
  // Nunca dos vigentes en el celular
  expect((await db.routines.toArray()).map((r) => [r.version, r.status])).toEqual([
    [1, 'historica'],
    [2, 'vigente'],
  ])
})

test('quitar un ejercicio y vaciar el RIR', async () => {
  let sent: { days: { exercises: unknown[] }[] } = { days: [] }
  mockFetch({
    'POST /api/routines/r1/versions': (init) => {
      sent = JSON.parse(String(init?.body)) as typeof sent
      return json(V2, 201)
    },
  })
  renderEditor()

  await card('Remo en T')
  await userEvent.click(screen.getByRole('button', { name: 'Quitar Remo en T' }))
  await setField('RIR mín. de Press de banca con barra', '')
  await setField('RIR máx. de Press de banca con barra', '')
  await userEvent.click(screen.getByRole('button', { name: 'Guardar versión 2' }))

  await screen.findByRole('status')
  expect(sent.days[0]!.exercises).toEqual([
    base('rde-banca', 'ex-banca', { rir_min: null, rir_max: null }),
  ])
})

test('el catálogo ofrece solo ejercicios con un músculo directo', async () => {
  renderEditor()

  const options = within(
    await screen.findByRole('combobox', { name: 'Agregar ejercicio' }),
  ).getAllByRole('option')

  expect(options.map((o) => o.textContent)).toEqual([
    'Elegí un ejercicio…',
    'Curl con mancuernas',
    'Prensa',
    'Press de banca con barra',
    'Remo en T',
  ])
})

test('un rango inválido no se manda', async () => {
  const fetchMock = mockFetch({})
  renderEditor()

  await card('Remo en T')
  await setField('Reps máx. de Remo en T', '4')
  await userEvent.click(screen.getByRole('button', { name: 'Guardar versión 2' }))

  expect(screen.getByRole('alert')).toHaveTextContent('Remo en T: las repeticiones')
  expect(fetchMock).not.toHaveBeenCalled()
})

test('sin conexión avisa y la rutina del celular no cambia', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
  renderEditor()

  await card('Remo en T')
  await setField('Series de Remo en T', '5')
  await userEvent.click(screen.getByRole('button', { name: 'Guardar versión 2' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
  expect(await db.routines.toArray()).toMatchObject([{ id: 'r1', status: 'vigente' }])
})

test('sin cambios no se puede guardar', async () => {
  renderEditor()

  await card('Remo en T')

  expect(screen.getByRole('button', { name: 'Guardar versión 2' })).toBeDisabled()
})
