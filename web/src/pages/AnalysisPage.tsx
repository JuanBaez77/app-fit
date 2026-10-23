import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { ApiError, NetworkError } from '../api/client'
import AnalysisResult from '../components/AnalysisResult'
import {
  latestAnalysis,
  requestAnalysis,
  SyncFailed,
  type Analysis,
  type AnalysisWindow,
  type Decision,
} from '../data/analyses'
import { useCurrentRoutine } from '../data/hooks'
import { db } from '../db/db'
import { useSyncStatus } from '../sync/useSync'

const WINDOWS: { value: AnalysisWindow; label: string; running: string }[] = [
  { value: '1w', label: '1 semana', running: 'la última semana' },
  { value: '4w', label: '4 semanas', running: 'las últimas 4 semanas' },
  { value: 'version', label: 'Esta versión', running: 'la versión vigente' },
]

const DAY_MS = 24 * 60 * 60 * 1000

function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS)
  return days <= 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`
}

function messageFor(error: unknown): string {
  if (error instanceof SyncFailed) return error.message
  // El pedido pudo haber llegado: el servidor termina y lo guarda aunque el celular se corte
  if (error instanceof NetworkError) {
    return 'Se cortó la comunicación mientras se analizaba. Si el servidor llegó a terminar, el análisis aparece acá al volver la red.'
  }
  if (error instanceof ApiError) return error.message
  return 'No se pudo pedir el análisis.'
}

/** Pedir un análisis y leer el último (US-16, US-17). Es lo único de la app que necesita red. */
export default function AnalysisPage() {
  const { online, pending } = useSyncStatus()
  const routine = useCurrentRoutine()
  const muscles = useLiveQuery(
    async () => new Map((await db.muscles.toArray()).map((m) => [m.id, m.name])),
    [],
  )
  const [span, setSpan] = useState<AnalysisWindow>('4w')
  // undefined: todavía no se sabe cuál es el último
  const [analysis, setAnalysis] = useState<Analysis | null | undefined>(undefined)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [loadFailed, setLoadFailed] = useState(false)

  // Con red, trae el último; si la red vuelve, lo intenta de nuevo
  useEffect(() => {
    if (!online) return
    let cancelled = false
    latestAnalysis().then(
      (latest) => {
        if (cancelled) return
        setAnalysis(latest)
        setLoadFailed(false)
      },
      () => {
        if (!cancelled) setLoadFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [online])

  async function analyze() {
    setRunning(true)
    setError(null)
    try {
      setAnalysis(await requestAnalysis(span))
    } catch (err) {
      setError(messageFor(err))
      // Si el servidor terminó igual, el análisis ya está guardado: traerlo
      if (err instanceof NetworkError) {
        await latestAnalysis().then(setAnalysis, () => {})
      }
    } finally {
      setRunning(false)
    }
  }

  function decided({ change }: Decision) {
    setAnalysis(
      (current) =>
        current && {
          ...current,
          changes: current.changes.map((c) => (c.id === change.id ? change : c)),
        },
    )
  }

  const blocked = !online
    ? 'Sin conexión: el análisis necesita internet.'
    : routine === null
      ? 'Todavía no hay rutina para analizar.'
      : null
  const label = WINDOWS.find((w) => w.value === span)!.running

  return (
    <main>
      <header className="page-header">
        <h1>Análisis</h1>
      </header>

      <div className="segmented" role="group" aria-label="Ventana">
        {WINDOWS.map((w) => (
          <button
            key={w.value}
            type="button"
            aria-pressed={w.value === span}
            disabled={running}
            onClick={() => setSpan(w.value)}
          >
            {w.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="primary big"
        disabled={running || blocked !== null || routine === undefined}
        onClick={() => void analyze()}
      >
        {running ? 'Analizando…' : '✦ Analizar'}
      </button>
      {blocked && <p className="muted">{blocked}</p>}
      {!blocked && pending > 0 && !running && (
        <p className="muted">Antes de analizar se suben los datos que faltan.</p>
      )}
      {analysis && !running && (
        <p className="muted">
          Último: {ago(analysis.created_at)} · brain {analysis.brain_version.slice(0, 7)}
        </p>
      )}

      {running && (
        <p role="status" className="notice">
          Analizando {label}. Tarda un par de minutos; si cerrás la app, el análisis sigue en el
          servidor y aparece acá al volver.
        </p>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}

      {analysis && muscles && !running && (
        <AnalysisResult
          analysis={analysis}
          muscleName={(id) => muscles.get(id) ?? id.replace(/_/g, ' ')}
          onDecided={decided}
        />
      )}
      {analysis === null && !running && !error && (
        <p className="muted">Todavía no pediste ningún análisis.</p>
      )}
      {analysis === undefined && loadFailed && online && (
        <p className="muted">No se pudo traer el último análisis.</p>
      )}
    </main>
  )
}
