import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ApiError } from '../api/client'
import AnalysisResult from '../components/AnalysisResult'
import { getAnalysis, type Analysis, type Decision } from '../data/analyses'
import { db } from '../db/db'
import { localDate, shortDate } from '../lib/dates'
import { useSyncStatus } from '../sync/useSync'

/** Un análisis anterior, completo: sus métricas, lo que dijo y qué se decidió (US-19). */
export default function AnalysisDetailPage() {
  const { id } = useParams()
  const { online } = useSyncStatus()
  const muscles = useLiveQuery(
    async () => new Map((await db.muscles.toArray()).map((m) => [m.id, m.name])),
    [],
  )
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!online || !id) return
    let cancelled = false
    getAnalysis(id).then(
      (found) => {
        if (cancelled) return
        setAnalysis(found)
        setError(null)
      },
      (err: unknown) => {
        if (cancelled) return
        setError(
          err instanceof ApiError && err.status === 404
            ? 'No existe ese análisis.'
            : 'No se pudo traer el análisis.',
        )
      },
    )
    return () => {
      cancelled = true
    }
  }, [online, id])

  function decided({ change }: Decision) {
    setAnalysis(
      (current) =>
        current && {
          ...current,
          changes: current.changes.map((c) => (c.id === change.id ? change : c)),
        },
    )
  }

  return (
    <main>
      <header className="page-header">
        <h1>
          {analysis
            ? `Análisis del ${shortDate(localDate(new Date(analysis.created_at)))}`
            : 'Análisis'}
        </h1>
        <Link to="/analisis/historial" className="link">
          Volver
        </Link>
      </header>
      {!online && !analysis && (
        <p className="muted">Sin conexión: los análisis se ven con internet.</p>
      )}
      {error && <p className="muted">{error}</p>}
      {analysis && muscles && (
        <AnalysisResult
          analysis={analysis}
          muscleName={(muscle) => muscles.get(muscle) ?? muscle.replace(/_/g, ' ')}
          onDecided={decided}
        />
      )}
    </main>
  )
}
