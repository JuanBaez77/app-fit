import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { ApiError, NetworkError } from '../api/client'
import RoutineView from '../components/RoutineView'
import { useExercises } from '../data/hooks'
import { restoreVersion } from '../data/routineEdit'
import { diffVersions } from '../data/versionDiff'
import { db } from '../db/db'
import type { Routine } from '../db/types'
import { shortDate } from '../lib/dates'
import { useSyncStatus } from '../sync/useSync'

const SOURCES: Record<NonNullable<Routine['source']>, string> = {
  importada: 'importada',
  manual: 'editada a mano',
  brain: 'cambio del brain',
}

function useRoutines(): Routine[] | undefined {
  return useLiveQuery(
    async () => (await db.routines.toArray()).sort((a, b) => b.version - a.version),
    [],
  )
}

/** La rutina vigente, con un editor por día, y la lista de versiones (US-02). */
export default function RoutinePage() {
  const routines = useRoutines()
  const exercises = useExercises()
  const saved = (useLocation().state as { savedVersion?: number } | null)?.savedVersion

  if (!routines || !exercises) return null
  const current = routines.find((r) => r.status === 'vigente')

  return (
    <main>
      <header className="page-header">
        <h1>Rutina</h1>
        <Link to="/" className="link">
          Volver
        </Link>
      </header>
      {saved && (
        <p role="status" className="notice">
          Guardada la versión {saved}.
        </p>
      )}
      {!current ? (
        <p className="muted">Todavía no hay rutina: importala desde Hoy.</p>
      ) : (
        <>
          <p className="muted">
            Versión {current.version}
            {current.start_on ? ` · desde el ${shortDate(current.start_on)}` : ''}
            {current.review_on ? ` · revisión el ${shortDate(current.review_on)}` : ''}
          </p>
          <RoutineView routine={current} exercises={exercises} editable />
        </>
      )}

      <h2>Versiones</h2>
      <ol className="versions">
        {routines.map((r) => (
          <li key={r.id}>
            <Link to={`/rutina/version/${r.id}`}>
              Versión {r.version}
              <span className="muted">
                {' '}
                · {r.source ? SOURCES[r.source] : 'sin origen'}
                {r.status === 'vigente' ? ' · vigente' : ''}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  )
}

/**
 * Una versión cualquiera, de solo lectura: qué cambió desde la anterior y, si no es la
 * vigente, volver a ella (US-19). Volver crea otra versión; la historia queda entera.
 */
export function VersionPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { online } = useSyncStatus()
  const data = useLiveQuery(async () => {
    const routine = id ? ((await db.routines.get(id)) ?? null) : null
    const parent = routine?.parent_routine_id
      ? ((await db.routines.get(routine.parent_routine_id)) ?? null)
      : null
    const latest = await db.routines.orderBy('version').last()
    const muscles = new Map((await db.muscles.toArray()).map((m) => [m.id, m.name]))
    return { routine, parent, next: (latest?.version ?? 0) + 1, muscles }
  }, [id])
  const exercises = useExercises()
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!data || !exercises) return null
  const { routine, parent, next, muscles } = data

  async function restore(target: Routine) {
    setRestoring(true)
    setError(null)
    try {
      const saved = await restoreVersion(target)
      navigate('/rutina', { state: { savedVersion: saved.version } })
    } catch (err) {
      setError(
        err instanceof NetworkError
          ? 'Sin conexión: volver a una versión necesita internet.'
          : err instanceof ApiError
            ? err.message
            : 'No se pudo volver a esta versión.',
      )
      setRestoring(false)
    }
  }

  const changes =
    routine && parent
      ? diffVersions(parent, routine, {
          exercise: (exerciseId) => exercises.get(exerciseId)?.name ?? 'Ejercicio',
          muscle: (muscleId) => muscles.get(muscleId) ?? muscleId.replace(/_/g, ' '),
        })
      : []

  return (
    <main>
      <header className="page-header">
        <h1>{routine ? `Versión ${routine.version}` : 'Versión'}</h1>
        <Link to="/rutina" className="link">
          Volver
        </Link>
      </header>
      {!routine ? (
        <p className="muted">No existe esa versión.</p>
      ) : (
        <>
          <p className="muted">
            {routine.status === 'vigente' ? 'Vigente' : 'Histórica'}
            {routine.source ? ` · ${SOURCES[routine.source]}` : ''}
          </p>
          {routine.from_analysis_id && (
            <p>
              <Link to={`/analisis/${routine.from_analysis_id}`}>Ver el análisis</Link>
            </p>
          )}

          {parent && (
            <section aria-labelledby="version-changes">
              <h2 id="version-changes">Qué cambió desde la versión {parent.version}</h2>
              {changes.length > 0 ? (
                <ul className="assessments">
                  {changes.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Nada: tiene el mismo contenido.</p>
              )}
            </section>
          )}

          {routine.status !== 'vigente' && (
            <div className="restore">
              <button
                type="button"
                className="primary big"
                disabled={restoring || !online}
                onClick={() => void restore(routine)}
              >
                Volver a esta versión
              </button>
              <p className="muted">
                {online
                  ? `Crea la versión ${next} con este contenido; la historia queda entera.`
                  : 'Sin conexión: volver a una versión necesita internet.'}
              </p>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
            </div>
          )}

          <RoutineView routine={routine} exercises={exercises} />
        </>
      )}
    </main>
  )
}
