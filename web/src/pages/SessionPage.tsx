import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import ExerciseCard from '../components/ExerciseCard'
import SyncBadge from '../components/SyncBadge'
import { useExerciseHistory, useExercises, useSession } from '../data/hooks'
import { db } from '../db/db'
import type { Exercise, RoutineDayExercise } from '../db/types'
import { shortDate } from '../lib/dates'
import { routineWeek, targetSets } from '../metrics'

export default function SessionPage() {
  const { id } = useParams()
  const session = useSession(id)
  // La rutina con la que se hizo la sesión, aunque después haya cambiado de versión
  const routine = useLiveQuery(
    async () =>
      session?.routine_id ? ((await db.routines.get(session.routine_id)) ?? null) : null,
    [session?.routine_id],
  )
  const exercises = useExercises()
  const setsToday = useLiveQuery(
    async () =>
      id
        ? (await db.set_logs.where('session_id').equals(id).toArray()).filter((s) => !s.deleted_at)
        : [],
    [id],
  )
  const [chosen, setChosen] = useState<string | null>(null)

  if (session === undefined || routine === undefined || !exercises || !setsToday) return null
  if (session === null) {
    return (
      <main className="content">
        <p>No encontré esa sesión.</p>
        <Link to="/">Volver a Hoy</Link>
      </main>
    )
  }

  const day = routine?.days.find((d) => d.id === session.routine_day_id)
  const items = [...(day?.exercises ?? [])].sort((a, b) => a.position - b.position)
  const week = routineWeek(routine?.start_on ?? null, session.date)
  const done = (item: RoutineDayExercise) =>
    setsToday.filter((s) => s.routine_day_exercise_id === item.id).length >= targetSets(item, week)
  // Sin elección, el primer ejercicio que todavía no completó sus series
  const current = items.find((i) => i.id === chosen) ?? items.find((i) => !done(i)) ?? items[0]

  return (
    <main className="content session">
      <SyncBadge />
      <header className="page-header">
        <Link to="/" aria-label="Volver a Hoy" className="back">
          ‹
        </Link>
        <h1>
          {day?.name ?? 'Sesión'} · {shortDate(session.date)}
        </h1>
      </header>
      {current && exercises.get(current.exercise_id) && (
        <CurrentExercise
          key={current.id}
          item={current}
          exercise={exercises.get(current.exercise_id)!}
          sessionId={session.id}
          plannedSets={targetSets(current, week)}
          position={items.indexOf(current) + 1}
          total={items.length}
        />
      )}
      <nav className="exercise-nav" aria-label="Ejercicios de la sesión">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={item.id === current?.id ? 'true' : undefined}
            className={done(item) ? 'done' : undefined}
            onClick={() => setChosen(item.id)}
          >
            {exercises.get(item.exercise_id)?.name ?? 'Ejercicio'}
            {done(item) && <span aria-label="completo"> ✓</span>}
          </button>
        ))}
      </nav>
    </main>
  )
}

function CurrentExercise(props: {
  item: RoutineDayExercise
  exercise: Exercise
  sessionId: string
  plannedSets: number
  position: number
  total: number
}) {
  const history = useExerciseHistory(props.exercise.id)
  if (!history) return null
  return <ExerciseCard {...props} history={history} />
}
