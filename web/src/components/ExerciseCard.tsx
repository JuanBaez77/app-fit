import type { Exercise, RoutineDayExercise, SetLog } from '../db/types'
import { decimal, kg, prescription, setText } from '../lib/format'
import { bestMark, compareSets, type SessionSets } from '../metrics'
import TrendMark from './TrendMark'

interface Props {
  /** null = ejercicio agregado fuera de rutina */
  item: RoutineDayExercise | null
  exercise: Exercise
  /** Series objetivo de esta semana (con la rampa aplicada); null fuera de rutina */
  plannedSets: number | null
  history: SessionSets[]
  today: SetLog[]
  last: SessionSets | null
  next: { setNumber: number; weight_kg: number; reps: number } | null
  editingSetId: string | null
  onSelectSet: (set: SetLog) => void
  position: number
  total: number
}

/** Un ejercicio de la sesión: qué toca, cómo fue la última vez, la mejor marca y las series de hoy. */
export default function ExerciseCard({
  item,
  exercise,
  plannedSets,
  history,
  today,
  last,
  next,
  editingSetId,
  onSelectSet,
  position,
  total,
}: Props) {
  const best = bestMark(history, exercise.e1rm_eligible)
  const titleId = `ex-${exercise.id}`

  return (
    <section className="exercise-card" aria-labelledby={titleId}>
      <header className="exercise-card-header">
        <h2 id={titleId}>{exercise.name}</h2>
        <span className="muted">
          {position} / {total}
        </span>
      </header>
      <p className="prescription">
        {item && plannedSets ? prescription(item, plannedSets) : 'Fuera de rutina'}
      </p>
      {item?.note && <p className="muted">{item.note}</p>}

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
              <button
                type="button"
                className="set-row"
                aria-pressed={set.id === editingSetId}
                aria-label={`Serie ${set.set_number}: ${kg(set.weight_kg)} kg × ${set.reps}, ${set.rir === null ? 'sin RIR' : `RIR ${set.rir}`}. Tocá para editar`}
                onClick={() => onSelectSet(set)}
              >
                <span className="set-number">{set.set_number}</span>
                <span>
                  {kg(set.weight_kg)} kg × {set.reps}
                </span>
                <span className="muted">{set.rir === null ? 'sin RIR' : `RIR ${set.rir}`}</span>
                {previous ? (
                  <TrendMark trend={compareSets(set, previous, exercise.e1rm_eligible)} />
                ) : (
                  <span />
                )}
              </button>
            </li>
          )
        })}
        {next && (
          <li className="next" aria-current="step">
            <span className="set-row">
              <span className="set-number">▶{next.setNumber}</span>
              <span>
                {kg(next.weight_kg)} kg × {next.reps}
              </span>
              <span className="muted">· · ·</span>
              <span />
            </span>
          </li>
        )}
      </ol>
      {plannedSets !== null && today.length >= plannedSets && (
        <p className="notice">Series de la rutina completas. Podés sumar una serie extra.</p>
      )}
    </section>
  )
}
