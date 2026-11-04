import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { expect, test } from 'vitest'
import { db } from '../db/db'
import type { Session, SetLog } from '../db/types'
import { EXERCISES, routine, STAMP } from '../test-data'
import SessionPage from './SessionPage'

function session(id: string, date: string): Session {
  return {
    id,
    routine_id: 'r1',
    routine_day_id: 'd-torso',
    date,
    started_at: `${date}T21:00:00.000Z`,
    ended_at: null,
    sleep_hours: null,
    discomfort: null,
    updated_at: STAMP,
    deleted_at: null,
  }
}

function set(sessionId: string, n: number, weight: number, reps: number): SetLog {
  return {
    id: `${sessionId}-${n}`,
    session_id: sessionId,
    exercise_id: 'ex-banca',
    routine_day_exercise_id: 'rde-banca',
    set_number: n,
    weight_kg: weight,
    reps,
    rir: 2,
    interaction_ms: null,
    logged_at: `2026-10-${sessionId === 'hoy' ? 26 : 19}T21:0${n}:00.000Z`,
    updated_at: STAMP,
    deleted_at: null,
  }
}

async function seed(extraRoutine = {}) {
  await db.routines.put(routine(extraRoutine))
  await db.exercises.bulkPut(EXERCISES)
  await db.sessions.bulkPut([session('antes', '2026-10-19'), session('hoy', '2026-10-26')])
  await db.set_logs.bulkPut([
    set('antes', 1, 80, 8),
    set('antes', 2, 80, 8),
    set('antes', 3, 80, 7),
  ])
}

function renderSession(id = 'hoy') {
  return render(
    <MemoryRouter initialEntries={[`/sesion/${id}`]}>
      <Routes>
        <Route path="/sesion/:id" element={<SessionPage />} />
        <Route path="/" element={<p>Pantalla Hoy</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

test('muestra qué toca, la última vez, la mejor marca y precarga la serie 1', async () => {
  await seed()
  renderSession()

  const card = await screen.findByRole('region', { name: 'Press de banca con barra' })
  expect(within(card).getByText('Ejercicio 1 de 2')).toBeInTheDocument()
  expect(
    within(within(card).getByRole('list', { name: 'Qué toca' }))
      .getAllByRole('listitem')
      .map((li) => li.textContent),
  ).toEqual(['3 × 6–10', 'RIR 1–2', 'desc. 2–3 min'])
  expect(within(card).getByText('Última vez').nextElementSibling).toHaveTextContent(
    '80×8 · 80×8 · 80×7',
  )
  expect(within(card).getByText('80×8 · 1RM ≈ 101,3 kg')).toBeInTheDocument()
  expect(within(card).getByText('80 kg × 8')).toBeInTheDocument()
})

test('arriba, el avance de las series de la rutina', async () => {
  await seed()
  renderSession()

  const progress = await screen.findByRole('progressbar', { name: 'Series de la rutina' })
  expect(progress).toHaveAttribute('aria-valuenow', '0')
  expect(screen.getByText(/0 de 6 series/)).toBeInTheDocument()

  await userEvent.click(await screen.findByRole('button', { name: 'RIR 2: guardar' }))

  expect(await screen.findByText(/1 de 6 series/)).toBeInTheDocument()
  expect(progress).toHaveAttribute('aria-valuenow', '1')
})

test('deslizar de costado sobre el ejercicio pasa al siguiente y vuelve', async () => {
  await seed()
  renderSession()
  const card = await screen.findByRole('region', { name: 'Press de banca con barra' })

  fireEvent.pointerDown(card, { clientX: 300, clientY: 100 })
  fireEvent.pointerUp(card, { clientX: 200, clientY: 105 })
  const remo = await screen.findByRole('region', { name: 'Remo en T' })

  fireEvent.pointerDown(remo, { clientX: 100, clientY: 100 })
  fireEvent.pointerUp(remo, { clientX: 220, clientY: 100 })
  expect(
    await screen.findByRole('region', { name: 'Press de banca con barra' }),
  ).toBeInTheDocument()
})

test('las series de hoy llevan el indicador contra la misma serie de la última vez', async () => {
  await seed()
  await db.set_logs.bulkPut([set('hoy', 1, 80, 9), set('hoy', 2, 77.5, 8)])
  renderSession()

  expect(await screen.findByLabelText('mejora')).toBeInTheDocument()
  expect(screen.getByLabelText('retroceso')).toBeInTheDocument()
  // La serie 3 se precarga con la 3 de la última vez
  expect(screen.getByText('80 kg × 7')).toBeInTheDocument()
})

test('se puede pasar a otro ejercicio; sin historial dice Primera vez', async () => {
  await seed()
  renderSession()

  await userEvent.click(await screen.findByRole('button', { name: 'Ejercicios' }))
  await userEvent.click(screen.getByRole('button', { name: /Remo en T/ }))

  const card = await screen.findByRole('region', { name: 'Remo en T' })
  expect(within(card).getByText('Primera vez')).toBeInTheDocument()
  // Sin historial arranca en 0 kg con el mínimo de repeticiones de la rutina
  expect(screen.getByRole('button', { name: /Peso: 0 kg/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Reps: 6/ })).toBeInTheDocument()
})

test('en la semana 1 usa las series de la rampa', async () => {
  const base = routine()
  const torso = base.days[0]!
  await seed({
    start_on: '2026-10-26',
    days: [
      {
        ...torso,
        exercises: [{ ...torso.exercises[0]!, ramp_sets: 2, ramp_weeks: 2 }, torso.exercises[1]!],
      },
      base.days[1]!,
    ],
  })
  renderSession()

  expect(await screen.findByText('2 × 6–10')).toBeInTheDocument()
})

test('sesión inexistente', async () => {
  renderSession('no-existe')

  expect(await screen.findByText('No encontré esa sesión.')).toBeInTheDocument()
})

async function todaySets() {
  return (await db.set_logs.where('session_id').equals('hoy').toArray())
    .filter((s) => !s.deleted_at)
    .sort((a, b) => a.set_number - b.set_number)
}

test('una serie sin cambios se guarda con un toque en la ficha de RIR', async () => {
  await seed()
  renderSession()

  await userEvent.click(await screen.findByRole('button', { name: 'RIR 2: guardar' }))

  const [saved] = await todaySets()
  expect(saved!.interaction_ms).toEqual(expect.any(Number))
  expect(saved).toMatchObject({
    set_number: 1,
    weight_kg: 80,
    reps: 8,
    rir: 2,
    routine_day_exercise_id: 'rde-banca',
  })
  expect(await screen.findByRole('region', { name: 'Serie 2 de 3' })).toBeInTheDocument()
  expect(await db.outbox.get(`set_logs:${saved!.id}`)).toBeDefined()
})

test('con un ajuste son dos toques; el RIR 3+ se guarda como 3', async () => {
  await seed()
  renderSession()

  await userEvent.click(await screen.findByRole('button', { name: 'Más peso' }))
  await userEvent.click(screen.getByRole('button', { name: 'RIR 3+: guardar' }))

  expect(await todaySets()).toMatchObject([{ weight_kg: 82.5, reps: 8, rir: 3 }])
})

test('guardar sin RIR y bajar repeticiones', async () => {
  await seed()
  renderSession()

  await userEvent.click(await screen.findByRole('button', { name: 'Menos reps' }))
  await userEvent.click(screen.getByRole('button', { name: 'Guardar sin RIR' }))

  expect(await todaySets()).toMatchObject([{ weight_kg: 80, reps: 7, rir: null }])
})

test('tocar el número abre el teclado numérico y acepta coma', async () => {
  await seed()
  renderSession()

  await userEvent.click(await screen.findByRole('button', { name: /Peso: 80 kg/ }))
  const input = screen.getByRole('textbox', { name: 'Peso' })
  expect(input).toHaveAttribute('inputmode', 'decimal')
  await userEvent.clear(input)
  await userEvent.type(input, '82,5{Enter}')
  await userEvent.click(screen.getByRole('button', { name: 'RIR 1: guardar' }))

  expect(await todaySets()).toMatchObject([{ weight_kg: 82.5, rir: 1 }])
})

test('el paso de peso sale del perfil', async () => {
  await seed()
  await db.profile.put({ key: 'me', weight_step_kg: 1.25 } as never)
  renderSession()

  await userEvent.click(await screen.findByRole('button', { name: 'Más peso' }))
  await userEvent.click(screen.getByRole('button', { name: 'RIR 2: guardar' }))

  expect((await todaySets())[0]?.weight_kg).toBe(81.25)
})

test('con la última serie de la rutina pasa solo al ejercicio siguiente', async () => {
  await seed()
  renderSession()

  for (let i = 0; i < 3; i++) {
    await userEvent.click(await screen.findByRole('button', { name: 'RIR 2: guardar' }))
    await screen.findByRole('region', { name: i < 2 ? `Serie ${i + 2} de 3` : 'Serie 1 de 3' })
  }

  expect(await screen.findByRole('region', { name: 'Remo en T' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Ejercicios' }))
  expect(
    screen.getByRole('button', { name: /Press de banca con barra.*3 de 3.*completo/ }),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Remo en T.*0 de 3/ })).toHaveAttribute(
    'aria-current',
    'true',
  )
})

test('una serie guardada se edita tocándola', async () => {
  await seed()
  renderSession()
  await userEvent.click(await screen.findByRole('button', { name: 'RIR 2: guardar' }))

  await userEvent.click(await screen.findByRole('button', { name: /Serie 1: 80 kg × 8/ }))
  expect(screen.getByRole('region', { name: 'Editar serie 1' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Más reps' }))
  await userEvent.click(screen.getByRole('button', { name: 'RIR 1: guardar' }))

  expect(await todaySets()).toMatchObject([{ set_number: 1, reps: 9, rir: 1 }])
})

test('borrar una serie se puede deshacer', async () => {
  await seed()
  renderSession()
  await userEvent.click(await screen.findByRole('button', { name: 'RIR 2: guardar' }))

  await userEvent.click(await screen.findByRole('button', { name: /Serie 1: 80 kg/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Borrar serie' }))
  // El aviso va arriba del panel, no encima de sus botones
  expect((await screen.findByText('Serie 1 borrada')).closest('.session-dock')).not.toBeNull()
  expect(await todaySets()).toHaveLength(0)

  await userEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
  await screen.findByRole('button', { name: /Serie 1: 80 kg/ })
  expect(await todaySets()).toHaveLength(1)
})

test('un ejercicio fuera de rutina se agrega desde el catálogo', async () => {
  await seed()
  renderSession()

  await userEvent.click(await screen.findByRole('button', { name: 'Ejercicios' }))
  await userEvent.click(screen.getByRole('button', { name: 'Agregar ejercicio' }))
  await userEvent.click(screen.getByRole('button', { name: 'Prensa' }))
  const card = await screen.findByRole('region', { name: 'Prensa' })
  expect(within(card).getByText('Fuera de rutina')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'RIR 1: guardar' }))

  expect(await todaySets()).toMatchObject([
    { exercise_id: 'ex-prensa', routine_day_exercise_id: null },
  ])
})

test('el catálogo se busca sin importar tildes ni mayúsculas', async () => {
  await seed()
  await db.exercises.put({ ...EXERCISES[2]!, id: 'ex-jalon', name: 'Jalón al pecho' })
  renderSession()

  await userEvent.click(await screen.findByRole('button', { name: 'Ejercicios' }))
  await userEvent.click(screen.getByRole('button', { name: 'Agregar ejercicio' }))
  const catalog = screen.getByRole('list', { name: 'Catálogo' })
  expect(
    within(catalog)
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual(['Jalón al pecho', 'Prensa'])

  await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar ejercicio' }), 'JALON')
  expect(
    within(catalog)
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual(['Jalón al pecho'])
  await userEvent.type(screen.getByRole('searchbox'), 'x')
  expect(screen.getByText('No hay ejercicios con ese nombre.')).toBeInTheDocument()
})

test('la hoja de ejercicios se cierra con Escape y con Listo', async () => {
  await seed()
  renderSession()

  await userEvent.click(await screen.findByRole('button', { name: 'Ejercicios' }))
  expect(screen.getByRole('dialog', { name: 'Ejercicios' })).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Ejercicios' }))
  await userEvent.click(screen.getByRole('button', { name: 'Listo' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('terminar la sesión guarda sueño y molestias y vuelve a Hoy', async () => {
  await seed()
  renderSession()

  await userEvent.click(await screen.findByRole('button', { name: 'Terminar' }))
  await userEvent.type(screen.getByLabelText(/Horas de sueño/), '7,5')
  await userEvent.type(screen.getByLabelText(/Molestias/), '  hombro derecho ')
  await userEvent.click(screen.getByRole('button', { name: 'Terminar sesión' }))

  expect(await screen.findByText('Pantalla Hoy')).toBeInTheDocument()
  const saved = await db.sessions.get('hoy')
  expect(saved).toMatchObject({ sleep_hours: 7.5, discomfort: 'hombro derecho' })
  expect(saved?.ended_at).toEqual(expect.any(String))
})

test('terminar sin completar nada también cierra', async () => {
  await seed()
  renderSession()

  await userEvent.click(await screen.findByRole('button', { name: 'Terminar' }))
  // El resumen, sin duración: la sesión de prueba empezó hace días
  expect(
    within(screen.getByRole('dialog', { name: 'Terminar la sesión' })).getByText(
      '0 ejercicios · 0 series',
    ),
  ).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Terminar sesión' }))

  await screen.findByText('Pantalla Hoy')
  expect(await db.sessions.get('hoy')).toMatchObject({ sleep_hours: null, discomfort: null })
})

test('horas de sueño fuera de rango', async () => {
  await seed()
  renderSession()

  await userEvent.click(await screen.findByRole('button', { name: 'Terminar' }))
  await userEvent.type(screen.getByLabelText(/Horas de sueño/), '30')
  await userEvent.click(screen.getByRole('button', { name: 'Terminar sesión' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('de 0 a 24')
  expect((await db.sessions.get('hoy'))?.ended_at).toBeNull()
})
