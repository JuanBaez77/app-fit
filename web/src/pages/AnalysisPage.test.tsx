import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import { saveWeight } from '../data/bodyWeights'
import { db } from '../db/db'
import { routine } from '../test-data'
import { json, mockFetch } from '../test-utils'
import AnalysisPage from './AnalysisPage'

const MONDAY = new Date(2026, 9, 19, 18, 0)

const SUMMARY = {
  id: 'a1',
  created_at: '2026-10-12T12:00:00+00:00',
  window_from: '2026-09-21',
  window_to: '2026-10-18',
  status: 'ok',
  routine_id: 'r1',
  brain_version: 'a1b2c3d4e5',
  model: 'claude-opus-5-5',
}

const ANALYSIS = {
  ...SUMMARY,
  prompt_version: '1',
  error: null,
  metrics: {
    window: {
      from: '2026-09-21',
      to: '2026-10-18',
      week_starts: ['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'],
      label: 'las últimas 4 semanas',
    },
    routine: {
      version: 1,
      muscle_targets: [
        { muscle_id: 'deltoides_lateral', target: 12, range: [10, 14], fractional_target: null },
      ],
    },
    metrics: {
      adherence: { planned: 16, done: 14 },
      weekly_volume: [
        { week_start: '2026-09-21', muscles: { deltoides_lateral: { direct: 6, fractional: 6 } } },
        { week_start: '2026-09-28', muscles: { deltoides_lateral: { direct: 6, fractional: 6 } } },
        { week_start: '2026-10-05', muscles: { deltoides_lateral: { direct: 6, fractional: 6 } } },
        { week_start: '2026-10-12', muscles: { deltoides_lateral: { direct: 6, fractional: 6 } } },
      ],
      exercises: [
        {
          exercise_id: 'ex-press-banca',
          name: 'Press de banca',
          sessions_in_window: 4,
          status_app: 'progresa',
          best_e1rm_kg: { value: 92.5, date: '2026-10-15' },
        },
        {
          exercise_id: 'ex-remo-t',
          name: 'Remo en T',
          sessions_in_window: 4,
          status_app: 'estancado',
          best_e1rm_kg: null,
        },
      ],
      data_quality: { sets_total: 120, rir_logged_pct: 0.62 },
    },
  },
  response: {
    summary: 'Cargas sostenidas en déficit.',
    confidence: 'media',
    confidence_reason: '4 semanas de datos y RIR en 62 % de las series.',
    exercise_assessments: [
      {
        exercise_id: 'ex-press-banca',
        status: 'progresa',
        comment: 'Mejor marca nueva con el mismo RIR.',
        basis: 'evidencia',
        evidence_links: ['progresar-da-mas-hipertrofia'],
      },
      {
        exercise_id: 'ex-remo-t',
        status: 'mantiene',
        comment: 'Mismas cargas que hace un mes.',
        basis: 'practica',
        evidence_links: [],
      },
    ],
    muscle_assessments: [
      {
        muscle_id: 'deltoides_lateral',
        verdict: 'por_debajo',
        comment: 'Por debajo del rango de la rutina.',
        evidence_links: ['volumen-semanal-dosis-respuesta'],
      },
    ],
    alerts: [{ kind: 'datos', severity: 'aviso', text: 'Falta RIR en parte de las series.' }],
    data_gaps: ['No se registró RIR en el 38 % de las series.'],
    notes: [],
  },
  discarded: null,
  changes: [
    {
      id: 'c1',
      position: 1,
      type: 'set_sets',
      target: { routine_day_exercise_id: 'i1', from: 4, to: 5 },
      title: 'Sumar 1 serie de laterales',
      rationale: 'Volumen bajo.',
      expectation: 'Acercarse al rango.',
      basis: 'evidencia',
      evidence_level: 1,
      evidence_links: ['volumen-semanal-dosis-respuesta'],
      dropped_links: null,
      status: 'pendiente',
      decided_at: null,
      applied_routine_id: null,
    },
  ],
}

const PULL = {
  cursor: '2026-10-19T21:00:00+00:00',
  sessions: [],
  set_logs: [],
  body_weights: [],
  exercises: [],
  routines: [routine()],
  profile: null,
  muscles: [{ id: 'deltoides_lateral', name: 'Deltoides lateral', parent_id: null }],
}

beforeEach(async () => {
  // Solo la fecha: IndexedDB necesita los timers reales
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(MONDAY)
  await db.routines.put(routine())
  await db.muscles.put({ id: 'deltoides_lateral', name: 'Deltoides lateral', parent_id: null })
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AnalysisPage />
    </MemoryRouter>,
  )
}

const analyzeButton = () => screen.findByRole('button', { name: /Analizar/ })

test('muestra el último análisis con las cifras de la app y la base de cada comentario', async () => {
  mockFetch({
    'GET /api/analyses': () => json([SUMMARY]),
    'GET /api/analyses/a1': () => json(ANALYSIS),
  })
  renderPage()

  expect(await screen.findByText('Cargas sostenidas en déficit.')).toBeInTheDocument()
  expect(screen.getByText('Confianza: media')).toBeInTheDocument()
  expect(screen.getByText(/Último: hace 7 días · brain a1b2c3d$/)).toBeInTheDocument()

  const press = screen.getByRole('listitem', { name: 'Press de banca' })
  expect(press).toHaveTextContent('↑ progresa')
  expect(press).toHaveTextContent('mejor 1RM estimado 92,5 kg')
  expect(press).toHaveTextContent('Base: evidencia · [[progresar-da-mas-hipertrofia]]')
  // El estado es el que calculó la app; si el brain lo lee distinto, lo dice aparte
  const row = screen.getByRole('listitem', { name: 'Remo en T' })
  expect(row).toHaveTextContent('⚠ estancado')
  expect(row).toHaveTextContent('El brain lo lee como mantiene.')
  expect(row).toHaveTextContent('Base: práctica')

  const lateral = screen.getByRole('listitem', { name: 'Deltoides lateral' })
  expect(lateral).toHaveTextContent('6 de 12')
  expect(lateral).toHaveTextContent('[[volumen-semanal-dosis-respuesta]]')

  expect(screen.getByText(/Falta RIR en parte de las series/)).toBeInTheDocument()
  expect(
    screen.getByText(/Entrenaste 14 de 16 días planificados · 120 series · RIR registrado en 62 %/),
  ).toBeInTheDocument()
  expect(
    within(screen.getByRole('list', { name: 'Datos que faltan' })).getByText(/38 %/),
  ).toBeInTheDocument()
  expect(screen.getByText('Sumar 1 serie de laterales')).toBeInTheDocument()
})

test('Analizar sube lo pendiente primero y pide la ventana elegida con el día del celular', async () => {
  const calls: string[] = []
  let sent: unknown
  mockFetch({
    'GET /api/analyses': () => json([]),
    'POST /api/sync/push': () => {
      calls.push('push')
      return json({ applied: 1, skipped: 0, rejected: [] })
    },
    'GET /api/sync/pull': () => {
      calls.push('pull')
      return json(PULL)
    },
    'POST /api/analyses': (init) => {
      calls.push('analyses')
      sent = JSON.parse(String(init?.body))
      return json(ANALYSIS, 201)
    },
  })
  await saveWeight('2026-10-19', 80)
  renderPage()

  expect(await screen.findByText('Todavía no pediste ningún análisis.')).toBeInTheDocument()
  expect(screen.getByText('Antes de analizar se suben los datos que faltan.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '1 semana' }))
  await userEvent.click(await analyzeButton())

  expect(await screen.findByText('Cargas sostenidas en déficit.')).toBeInTheDocument()
  expect(calls).toEqual(['push', 'pull', 'analyses'])
  expect(sent).toEqual({ window: '1w', today: '2026-10-19' })
  expect(await db.outbox.count()).toBe(0)
})

test('mientras analiza lo dice y no deja pedir otro', async () => {
  let answer: ((response: Response) => void) | undefined
  mockFetch({
    'GET /api/analyses': () => json([]),
    'GET /api/sync/pull': () => json(PULL),
    'POST /api/analyses': () => new Promise<Response>((resolve) => (answer = resolve)),
  })
  renderPage()

  await userEvent.click(await analyzeButton())

  expect(await screen.findByRole('status')).toHaveTextContent(
    'Analizando las últimas 4 semanas. Tarda un par de minutos',
  )
  expect(screen.getByRole('button', { name: 'Analizando…' })).toBeDisabled()
  // El pedido sale después de sincronizar
  await vi.waitFor(() => expect(answer).toBeDefined())
  answer!(json(ANALYSIS, 201))
  expect(await screen.findByText('Cargas sostenidas en déficit.')).toBeInTheDocument()
})

test('sin conexión, Analizar queda desactivado y dice por qué', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  const fetchMock = mockFetch({})
  renderPage()

  expect(await analyzeButton()).toBeDisabled()
  expect(screen.getByText('Sin conexión: el análisis necesita internet.')).toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
})

test('un error de la API se muestra con su motivo', async () => {
  mockFetch({
    'GET /api/analyses': () => json([]),
    'GET /api/sync/pull': () => json(PULL),
    'POST /api/analyses': () =>
      json({ detail: 'Falta configurar ANTHROPIC_API_KEY en el servidor' }, 503),
  })
  renderPage()

  await userEvent.click(await analyzeButton())

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Falta configurar ANTHROPIC_API_KEY en el servidor',
  )
  expect(await analyzeButton()).toBeEnabled()
})

test('si la API de Claude falló, el análisis guardado lo dice con el motivo', async () => {
  mockFetch({
    'GET /api/analyses': () => json([]),
    'GET /api/sync/pull': () => json(PULL),
    'POST /api/analyses': () =>
      json(
        {
          ...ANALYSIS,
          status: 'fallido',
          response: null,
          changes: [],
          error: 'La API de Claude no respondió bien: Connection error.',
        },
        201,
      ),
  })
  renderPage()

  await userEvent.click(await analyzeButton())

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('El análisis falló.')
  expect(alert).toHaveTextContent('La API de Claude no respondió bien: Connection error.')
  expect(alert).toHaveTextContent('Quedó guardado con el motivo')
})

test('si se corta la conexión mientras analiza, avisa y trae lo que el servidor guardó', async () => {
  let saved = false
  mockFetch({
    'GET /api/analyses': () => json(saved ? [SUMMARY] : []),
    'GET /api/analyses/a1': () => json(ANALYSIS),
    'GET /api/sync/pull': () => json(PULL),
    'POST /api/analyses': () => {
      // El servidor terminó y guardó, pero la respuesta no llegó
      saved = true
      throw new TypeError('Failed to fetch')
    },
  })
  renderPage()

  await userEvent.click(await analyzeButton())

  expect(await screen.findByRole('alert')).toHaveTextContent('Se cortó la comunicación')
  expect(await screen.findByText('Cargas sostenidas en déficit.')).toBeInTheDocument()
})

test('si no se pudo sincronizar, no pide el análisis', async () => {
  const fetchMock = mockFetch({
    'GET /api/analyses': () => json([]),
    'GET /api/sync/pull': () => json({ detail: 'boom' }, 500),
  })
  renderPage()

  await userEvent.click(await analyzeButton())

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'No se pudieron subir los datos del celular',
  )
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
})
