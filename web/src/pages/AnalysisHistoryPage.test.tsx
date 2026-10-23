import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { expect, test, vi } from 'vitest'
import { json, mockFetch } from '../test-utils'
import AnalysisDetailPage from './AnalysisDetailPage'
import AnalysisHistoryPage from './AnalysisHistoryPage'

const BASE = {
  window_from: '2026-09-21',
  window_to: '2026-10-18',
  routine_id: 'r1',
  brain_version: 'a1b2c3d',
  model: 'claude-opus-5-5',
}

const LIST = [
  {
    ...BASE,
    id: 'a2',
    created_at: '2026-10-19T15:00:00+00:00',
    status: 'ok',
    confidence: 'media',
    changes: [
      { id: 'c1', title: 'Sumar 1 serie', status: 'aceptado' },
      { id: 'c2', title: 'Bajar el RIR', status: 'aceptado' },
      { id: 'c3', title: 'Cambiar el descanso', status: 'rechazado' },
      { id: 'c4', title: 'Quitar el curl', status: 'pendiente' },
    ],
  },
  {
    ...BASE,
    id: 'a1',
    created_at: '2026-10-12T15:00:00+00:00',
    status: 'fallido',
    confidence: null,
    changes: [],
  },
]

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/analisis/historial" element={<AnalysisHistoryPage />} />
        <Route path="/analisis/:id" element={<AnalysisDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

test('la lista de análisis dice qué se decidió de cada uno', async () => {
  mockFetch({ 'GET /api/analyses': () => json(LIST) })
  renderAt('/analisis/historial')

  const [last, failed] = await screen.findAllByRole('link', { name: /Del / })
  expect(last).toHaveTextContent('lun 19 oct')
  expect(last).toHaveTextContent('confianza media')
  expect(last).toHaveTextContent('2 aceptados · 1 rechazado · 1 por decidir')
  expect(last).toHaveAttribute('href', '/analisis/a2')
  expect(failed).toHaveTextContent('falló')
})

test('un análisis anterior se abre completo', async () => {
  mockFetch({
    'GET /api/analyses': () => json(LIST),
    'GET /api/analyses/a1': () =>
      json({
        ...LIST[1],
        prompt_version: '1',
        error: 'La API de Claude no respondió bien: Connection error.',
        metrics: {},
        response: null,
        discarded: null,
        changes: [],
      }),
  })
  renderAt('/analisis/historial')

  await userEvent.click((await screen.findAllByRole('link', { name: /Del / }))[1]!)

  expect(
    await screen.findByRole('heading', { name: 'Análisis del lun 12 oct' }),
  ).toBeInTheDocument()
  // El resultado espera también los nombres de los músculos, que salen del celular
  expect(await screen.findByRole('alert')).toHaveTextContent('La API de Claude no respondió bien')
})

test('sin conexión, el historial avisa', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  const fetchMock = mockFetch({})
  renderAt('/analisis/historial')

  expect(
    await screen.findByText('Sin conexión: el historial se ve con internet.'),
  ).toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
})
