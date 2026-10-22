import type { Exercise, RoutineDayExercise, SetLog } from '../db/types'
import { decimal, kg, prescription, setText } from '../lib/format'
import { bestMark, compareSets, lastTime, prefill, type SessionSets } from '../metrics'
import TrendMark from './TrendMark'

interface Props {
  item: RoutineDayExercise
  exercise: Exercise
  sessionId: string
  /** Series objetivo de esta semana (con la rampa aplicada) */
  plannedSets: number
  history: SessionSets[]
  position: number
  total: number
}

/** Un ejercicio de la sesión: qué toca, cómo fue la última vez, la mejor marca y las series de hoy. */
export default function ExerciseCard({
  item,
  exercise,
  sessionId,
  plannedSets,
  history,
  position,
  total,
}: Props) {
  const today: SetLog[] = history.find((g) => g.session.id === sessionId)?.sets ?? []
  const last = lastTime(history, sessionId)
  const best = bestMark(history, exercise.e1rm_eligible)
  const nextNumber = today.length + 1
  const next = prefill(nextNumber, last)
  const titleId = `ex-${item.id}`

  return (
    <section className="exercise-card" aria-labelledby={titleId}>
      <header className="exercise-card-header">
        <h2 id={titleId}>{exercise.name}</h2>
        <span className="muted">
          {position} / {total}
        </span>
      </header>
      <p className="prescription">{prescription(item, plannedSets)}</p>
      {item.note && <p className="muted">{item.note}</p>}

      <dl className="history">
        <dt>Última vez</dt>
        <dd>
          {last
            ? last.sets.map((s, i) => (
                // El espacio separa las series también para el lector de pantalla
                <span key={s.id} className="last-set">
                  {i > 0 && ' '}
                  {setText(s.weight_kg, s.reps)}
                </span>
              ))
            : 'Primera vez'}
        </dd>
        <dt>Mejor marca</dt>
        <dd>
          {best
            ? `${setText(best.set.weight_kg, best.set.reps)}${best.e1rm ? ` (1RM ≈ ${decimal(best.e1rm)} kg)` : ''}`
            : '—'}
        </dd>
      </dl>

      <ol className="sets" aria-label="Series de hoy">
        {today.map((set) => {
          const previous = last?.sets.find((s) => s.set_number === set.set_number)
          return (
            <li key={set.id}>
              <span className="set-number">{set.set_number}</span>
              <span>
                {kg(set.weight_kg)} kg × {set.reps}
              </span>
              <span className="muted">{set.rir === null ? 'sin RIR' : `RIR ${set.rir}`}</span>
              {previous && <TrendMark trend={compareSets(set, previous, exercise.e1rm_eligible)} />}
            </li>
          )
        })}
        <li className="next" aria-current="step">
          <span className="set-number">▶{nextNumber}</span>
          <span>{next ? `${kg(next.weight_kg)} kg × ${next.reps}` : 'Sin historial'}</span>
          <span className="muted">· · ·</span>
        </li>
      </ol>
      {today.length >= plannedSets && <p className="notice">Series de la rutina completas.</p>}
    </section>
  )
}
