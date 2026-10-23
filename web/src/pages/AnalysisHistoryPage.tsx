import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { listAnalyses, type AnalysisListItem } from '../data/analyses'
import { localDate, shortDate } from '../lib/dates'
import { useSyncStatus } from '../sync/useSync'

const DECISIONS = [
  ['aceptado', 'aceptado', 'aceptados'],
  ['rechazado', 'rechazado', 'rechazados'],
  ['pendiente', 'por decidir', 'por decidir'],
  ['obsoleto', 'ya no aplica', 'ya no aplican'],
] as const

/** "2 aceptados · 1 rechazado", o "sin cambios" */
function decisions(analysis: AnalysisListItem): string {
  const parts = DECISIONS.flatMap(([status, one, many]) => {
    const n = analysis.changes.filter((c) => c.status === status).length
    return n ? [`${n} ${n === 1 ? one : many}`] : []
  })
  return parts.length ? parts.join(' · ') : 'sin cambios'
}

/** Los análisis anteriores, con qué se aceptó o rechazó de cada uno (US-19). */
export default function AnalysisHistoryPage() {
  const { online } = useSyncStatus()
  const [analyses, setAnalyses] = useState<AnalysisListItem[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!online) return
    let cancelled = false
    listAnalyses().then(
      (list) => {
        if (cancelled) return
        setAnalyses(list)
        setFailed(false)
      },
      () => {
        if (!cancelled) setFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [online])

  return (
    <main>
      <header className="page-header">
        <h1>Historial</h1>
        <Link to="/analisis" className="link">
          Volver
        </Link>
      </header>
      {!online && <p className="muted">Sin conexión: el historial se ve con internet.</p>}
      {online && failed && <p className="muted">No se pudo traer el historial.</p>}
      {analyses?.length === 0 && <p className="muted">Todavía no pediste ningún análisis.</p>}
      {analyses && analyses.length > 0 && (
        <ol className="history-list">
          {analyses.map((a) => (
            <li key={a.id}>
              <Link to={`/analisis/${a.id}`} className="card history-item">
                <strong>{shortDate(localDate(new Date(a.created_at)))}</strong>
                <span className="muted">
                  Del {shortDate(a.window_from)} al {shortDate(a.window_to)}
                  {a.status === 'fallido'
                    ? ' · falló'
                    : a.confidence
                      ? ` · confianza ${a.confidence}`
                      : ''}
                </span>
                {a.status === 'ok' && <span>{decisions(a)}</span>}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </main>
  )
}
