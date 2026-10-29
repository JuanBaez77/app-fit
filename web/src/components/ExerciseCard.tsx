import type { Exercise, RoutineDayExercise, SetLog } from '../db/types'
import { decimal, kg, prescriptionParts, setText } from '../lib/format'
import type { SwipeHandlers } from '../lib/swipe'
import { bestMark, compareSets, type SessionSets } from '../metrics'
import Icon from './Icon'
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
  /** La serie recién guardada: entra con una animación corta */
  justSavedId: string | null
  onSelectSet: (set: SetLog) => void
  position: number
  total: number
  swipe?: SwipeHandlers
  /** De qué lado entra, para la animación */
  direction: 'next' | 'prev' | null
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
  justSavedId,
  onSelectSet,
  position,
  total,
  swipe,
  direction,
}: Props) {
  const best = bestMark(history, exercise.e1rm_eligible)
  const titleId = `ex-${exercise.id}`

  return (
    <section
      className={`exercise-card swipe-area${direction ? ` from-${direction}` : ''}`}
      aria-labelledby={titleId}
      {...swipe}
    >
      <header className="exercise-card-header">
        <h2 id={titleId}>{exercise.name}</h2>
        {total > 1 && (
          // Los puntos de iOS: en qué ejercicio estás y cuántos hay
          <span className="page-dots">
            <span className="sr-only">
              Ejercicio {position} de {total}
            </span>
            {Array.from({ length: total }, (_, i) => (
              <span key={i} aria-hidden="true" className={i === position - 1 ? 'on' : undefined} />
            ))}
          </span>
        )}
      </header>
      {item && plannedSets ? (
        <ul className="pills" aria-label="Qué toca">
          {prescriptionParts(item, plannedSets).map((part) => (
            <li key={part}>{part}</li>
          ))}
        </ul>
      ) : (
        <p className="pills">
          <span className="badge">Fuera de rutina</span>
        </p>
      )}
      {item?.note && <p className="muted subhead">{item.note}</p>}

      <dl className="history">
        <div>
          <dt>Última vez</dt>
          <dd>
            {last ? last.sets.map((s) => setText(s.weight_kg, s.reps)).join(' · ') : 'Primera vez'}
          </dd>
        </div>
        <div>
          <dt>Mejor marca</dt>
          <dd>
            {best
              ? `${setText(best.set.weight_kg, best.set.reps)}${best.e1rm ? ` · 1RM ≈ ${decimal(best.e1rm)} kg` : ''}`
              : '—'}
          </dd>
        </div>
      </dl>

      <ol className="grouped sets" aria-label="Series de hoy">
        {today.map((set) => {
          const previous = last?.sets.find((s) => s.set_number === set.set_number)
          return (
            <li key={set.id} className={set.id === justSavedId ? 'just-saved' : undefined}>
              <button
                type="button"
                className="grouped-row set-row"
                aria-pressed={set.id === editingSetId}
                aria-label={`Serie ${set.set_number}: ${kg(set.weight_kg)} kg × ${set.reps}, ${set.rir === null ? 'sin RIR' : `RIR ${set.rir}`}. Tocá para editar`}
                onClick={() => onSelectSet(set)}
              >
                <span className="set-mark done">
                  <Icon name="check" size={16} />
                </span>
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
            <span className="grouped-row set-row">
              <span className="set-mark">{next.setNumber}</span>
              <span>
                {kg(next.weight_kg)} kg × {next.reps}
              </span>
              <span className="muted">ahora</span>
              <span />
            </span>
          </li>
        )}
      </ol>
      {plannedSets !== null && today.length >= plannedSets && (
        <p className="list-footer footnote sets-complete">
          <Icon name="check" size={14} />
          Series de la rutina completas. Podés sumar una extra.
        </p>
      )}
    </section>
  )
}
