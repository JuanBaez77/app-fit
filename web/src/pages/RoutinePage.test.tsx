import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, expect, test } from 'vitest'
import { db } from '../db/db'
import { EXERCISES, routine } from '../test-data'
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
