import { Link, useParams } from 'react-router'
import SyncBadge from '../components/SyncBadge'
import { useCurrentRoutine, useExercises, useSession } from '../data/hooks'
import { shortDate } from '../lib/dates'

// PR-12 trae la tarjeta de cada ejercicio y PR-13 el registro de series.
export default function SessionPage() {
  const { id } = useParams()
  const session = useSession(id)
  const routine = useCurrentRoutine()
  const exercises = useExercises()

  if (session === undefined || routine === undefined || exercises === undefined) return null
  if (session === null) {
    return (
      <main className="content">
        <p>No encontré esa sesión.</p>
        <Link to="/">Volver a Hoy</Link>
      </main>
    )
  }

  const day = routine?.days.find((d) => d.id === session.routine_day_id)
  return (
    <main className="content">
      <SyncBadge />
      <header className="page-header">
        <Link to="/" aria-label="Volver a Hoy" className="back">
          ‹
        </Link>
        <h1>
          {day?.name ?? 'Sesión'} · {shortDate(session.date)}
        </h1>
      </header>
      <ol className="exercise-list">
        {day?.exercises.map((item) => (
          <li key={item.id}>{exercises.get(item.exercise_id)?.name ?? 'Ejercicio'}</li>
        ))}
      </ol>
    </main>
  )
}
