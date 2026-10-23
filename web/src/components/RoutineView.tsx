import { Link } from 'react-router'
import type { Exercise, Routine } from '../db/types'
import { weekdayName } from '../lib/dates'
import { prescription } from '../lib/format'

/** Los días de una versión con sus ejercicios. Con editable, cada día lleva a su editor. */
export default function RoutineView({
  routine,
  exercises,
  editable = false,
}: {
  routine: Routine
  exercises: Map<string, Exercise>
  editable?: boolean
}) {
  return (
    <>
      {routine.days.map((day) => (
        <section key={day.id} className="card" aria-label={day.name}>
          <div className="routine-day-header">
            <strong>
              {day.name}
              {day.weekday ? <span className="muted"> · {weekdayName(day.weekday)}</span> : null}
            </strong>
            {editable && (
              <Link to={`/rutina/dia/${day.id}`} className="link">
                Editar
              </Link>
            )}
          </div>
          <ol className="routine-items">
            {day.exercises.map((item) => (
              <li key={item.id}>
                {exercises.get(item.exercise_id)?.name ?? 'Ejercicio'}
                <span className="muted"> · {prescription(item, item.target_sets)}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
  )
}
