import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useLocation, useParams } from 'react-router'
import RoutineView from '../components/RoutineView'
import { useExercises } from '../data/hooks'
import { db } from '../db/db'
import type { Routine } from '../db/types'
import { shortDate } from '../lib/dates'

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

/** Una versión cualquiera, de solo lectura: las anteriores siguen consultables. */
export function VersionPage() {
  const { id } = useParams()
  const routine = useLiveQuery(
    async () => (id ? ((await db.routines.get(id)) ?? null) : null),
    [id],
  )
  const exercises = useExercises()

  if (routine === undefined || !exercises) return null

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
          <RoutineView routine={routine} exercises={exercises} />
        </>
      )}
    </main>
  )
}
