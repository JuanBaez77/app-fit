import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import { db } from '../db/db'
import { EXERCISES, routine } from '../test-data'
import { json, mockFetch } from '../test-utils'
import RoutinePage, { VersionPage } from './RoutinePage'

beforeEach(async () => {
  const v1 = routine({ status: 'historica' })
  const v2 = routine({
    id: 'r2',
    version: 2,
    source: 'manual',
    parent_routine_id: 'r1',
    // En la v2 el torso perdió el remo
    days: [{ ...v1.days[0]!, id: 'd2-torso', exercises: v1.days[0]!.exercises.slice(0, 1) }],
  })
  await db.routines.bulkPut([v1, v2])
  await db.exercises.bulkPut(EXERCISES)
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/rutina" element={<RoutinePage />} />
        <Route path="/rutina/version/:id" element={<VersionPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

test('la versión vigente con sus días y la lista de versiones', async () => {
  renderAt('/rutina')

  const torso = await screen.findByRole('region', { name: 'Torso' })
  expect(torso).toHaveTextContent('Press de banca con barra · 3 × 6–10 · RIR 1–2 · desc. 2–3 min')
  expect(torso).not.toHaveTextContent('Remo en T')
  expect(within(torso).getByRole('link', { name: 'Editar' })).toHaveAttribute(
    'href',
    '/rutina/dia/d2-torso',
  )
  expect(screen.getAllByRole('link', { name: /^Versión/ }).map((l) => l.textContent)).toEqual([
    'Versión 2 · editada a mano · vigente',
    'Versión 1 · importada',
  ])
})

test('la versión anterior sigue consultable, sin editar', async () => {
  renderAt('/rutina')

  await userEvent.click(await screen.findByRole('link', { name: /^Versión 1/ }))

  expect(await screen.findByRole('heading', { name: 'Versión 1' })).toBeInTheDocument()
  expect(screen.getByText('Histórica · importada')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Torso' })).toHaveTextContent('Remo en T')
  expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
})

test('cada versión dice qué cambió desde la anterior', async () => {
  renderAt('/rutina/version/r2')

  const changes = await screen.findByRole('region', { name: 'Qué cambió desde la versión 1' })
  expect(
    within(changes)
      .getAllByRole('listitem')
      .map((li) => li.textContent),
  ).toEqual(['Torso: se quitó Remo en T', 'Se quitó el día Pierna A'])
  // La vigente no se restaura
  expect(screen.queryByRole('button', { name: 'Volver a esta versión' })).not.toBeInTheDocument()
})

test('volver a una versión crea otra y deja la historia', async () => {
  const v3 = routine({ id: 'r3', version: 3, source: 'manual', parent_routine_id: 'r2' })
  mockFetch({ 'POST /api/routines/r1/restore': () => json(v3, 201) })
  renderAt('/rutina/version/r1')

  expect(await screen.findByText(/Crea la versión 3 con este contenido/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Volver a esta versión' }))

  expect(await screen.findByRole('status')).toHaveTextContent('Guardada la versión 3.')
  expect(screen.getAllByRole('link', { name: /^Versión/ }).map((l) => l.textContent)).toEqual([
    'Versión 3 · editada a mano · vigente',
    'Versión 2 · editada a mano',
    'Versión 1 · importada',
  ])
})

test('sin conexión no se puede volver a una versión', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  renderAt('/rutina/version/r1')

  expect(await screen.findByRole('button', { name: 'Volver a esta versión' })).toBeDisabled()
  expect(
    screen.getByText('Sin conexión: volver a una versión necesita internet.'),
  ).toBeInTheDocument()
})

test('una versión del brain lleva a su análisis', async () => {
  await db.routines.put(
    routine({
      id: 'r3',
      version: 3,
      status: 'historica',
      source: 'brain',
      parent_routine_id: 'r2',
      from_analysis_id: 'a1',
    }),
  )
  renderAt('/rutina/version/r3')

  expect(await screen.findByRole('link', { name: 'Ver el análisis' })).toHaveAttribute(
    'href',
    '/analisis/a1',
  )
})
