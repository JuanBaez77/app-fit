import { useRef, useState, type Ref } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError, NetworkError, request } from '../api/client'
import Icon from '../components/Icon'
import { plannedWeekdays } from '../data/calendar'
import {
  useCurrentRoutine,
  useExercises,
  useHasSynced,
  useSessionsBetween,
  type SessionsWithSets,
} from '../data/hooks'
import { startSession } from '../data/sessions'
import { daySummary, durationText, nextPlannedDay, weekDates } from '../data/today'
import type { Exercise, LocalDate, Routine, RoutineDay, Session } from '../db/types'
import {
  isoWeekday,
  localDate,
  longDate,
  parseLocalDate,
  timeOfDay,
  weekdayName,
} from '../lib/dates'
import { range } from '../lib/format'
import { routineWeek, targetSets } from '../metrics'
import { syncNow } from '../sync/engine'

/** Ejercicios que se ven antes de "Ver los N ejercicios" */
const PREVIEW_ITEMS = 3

export default function HoyPage() {
  const today = localDate()
  const days = weekDates(today)
  const routine = useCurrentRoutine()
  const week = useSessionsBetween(days[0]!, days[6]!)
  const exercises = useExercises()
  const hasSynced = useHasSynced()

  return (
    <main>
      <header className="page-header large">
        <div>
          <p className="eyebrow">{longDate()}</p>
          <h1>Hoy</h1>
        </div>
        <nav className="header-actions" aria-label="Rutina y ajustes">
          <Link to="/rutina" className="icon-button" aria-label="Rutina">
            <span>
              <Icon name="list" />
            </span>
          </Link>
          <Link to="/ajustes" className="icon-button" aria-label="Ajustes">
            <span>
              <Icon name="gear" />
            </span>
          </Link>
        </nav>
      </header>
      {routine === undefined || week === undefined || exercises === undefined ? null : routine ===
        null ? (
        <FirstUse hasSynced={hasSynced ?? false} />
      ) : (
        <Today routine={routine} week={week} days={days} today={today} exercises={exercises} />
      )}
    </main>
  )
}

function Today({
  routine,
  week,
  days,
  today,
  exercises,
}: {
  routine: Routine
  week: SessionsWithSets
  days: LocalDate[]
  today: LocalDate
  exercises: Map<string, Exercise>
}) {
  const navigate = useNavigate()
  const [chosenId, setChosenId] = useState<string | null>(null)
  const cardRef = useRef<HTMLElement>(null)
  const weekday = isoWeekday()
  const routineDays = [...routine.days].sort((a, b) => a.position - b.position)
  const planned = routineDays.find((d) => d.weekday === weekday)
  const shown = routineDays.find((d) => d.id === chosenId) ?? planned
  const weekNumber = routineWeek(routine.start_on, today)

  const todaySessions = week.sessions.filter((s) => s.date === today)
  const openSession = todaySessions.find((s) => !s.ended_at)
  const doneDays = new Set(todaySessions.filter((s) => s.ended_at).map((s) => s.routine_day_id))

  async function start(day: RoutineDay) {
    const session = await startSession(routine, day)
    navigate(`/sesion/${session.id}`)
  }

  function choose(day: RoutineDay) {
    setChosenId(day.id)
    // La tarjeta está arriba: si se eligió desde abajo de la lista, vuelve al principio de Hoy
    // (jsdom no tiene scrollIntoView)
    cardRef.current?.closest('main')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <WeekStrip routine={routine} week={week} days={days} today={today} />
      {openSession ? (
        <OpenSession
          session={openSession}
          day={routineDays.find((d) => d.id === openSession.routine_day_id)}
          setsDone={week.setsBySession.get(openSession.id) ?? 0}
          weekNumber={weekNumber}
        />
      ) : (
        <>
          {shown ? (
            <DayCard
              key={shown.id}
              ref={cardRef}
              day={shown}
              tag={
                Number.isFinite(weekNumber)
                  ? `Semana ${weekNumber} · rutina v${routine.version}`
                  : `Rutina v${routine.version}`
              }
              weekNumber={weekNumber}
              exercises={exercises}
              done={doneDays.has(shown.id)}
              onStart={() => void start(shown)}
            />
          ) : (
            <RestCard next={nextPlannedDay(routine, weekday)} weekday={weekday} />
          )}
          <section className="other-days" aria-labelledby="other-days-title">
            <h2 id="other-days-title" className="section-title">
              {shown ? 'Otras sesiones' : 'Elegir una sesión'}
            </h2>
            <ul className="grouped">
              {routineDays
                .filter((d) => d.id !== shown?.id)
                .map((day) => (
                  <li key={day.id}>
                    <button type="button" className="grouped-row" onClick={() => choose(day)}>
                      <span className="grouped-row-text">
                        <span>{day.name}</span>
                        <span className="muted subhead">
                          {day.weekday ? `${weekdayName(day.weekday)} · ` : ''}
                          {day.exercises.length} ejercicios
                        </span>
                      </span>
                      {doneDays.has(day.id) && (
                        <span className="badge badge-ok">
                          <Icon name="check" size={14} />
                          Hecha
                        </span>
                      )}
                      <Icon name="chevron" size={18} className="chevron" />
                    </button>
                  </li>
                ))}
            </ul>
            {!shown && (
              <p className="list-footer footnote muted">Si querés entrenar igual, elegí una.</p>
            )}
          </section>
        </>
      )}
    </>
  )
}

const WEEKDAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/** La semana en curso: qué días se entrenó, cuáles tocan y cuáles son de descanso. */
function WeekStrip({
  routine,
  week,
  days,
  today,
}: {
  routine: Routine
  week: SessionsWithSets
  days: LocalDate[]
  today: LocalDate
}) {
  const planned = plannedWeekdays(routine)
  // Como en el calendario: cuenta el día con al menos una serie
  const trained = new Set(
    week.sessions.filter((s) => (week.setsBySession.get(s.id) ?? 0) > 0).map((s) => s.date),
  )

  return (
    <ol
      className="week-strip"
      aria-label={`Esta semana: ${trained.size} ${trained.size === 1 ? 'día entrenado' : 'días entrenados'}, ${planned.size} planificados`}
    >
      {days.map((date, i) => {
        const state = trained.has(date)
          ? 'trained'
          : !planned.has(i + 1)
            ? 'rest'
            : date < today
              ? 'missed'
              : 'planned'
        const label = [
          `${weekdayName(i + 1)} ${parseLocalDate(date).getDate()}`,
          date === today ? 'hoy' : null,
          { trained: 'entrenado', rest: 'descanso', missed: 'sin entrenar', planned: null }[state],
        ]
          .filter(Boolean)
          .join(', ')
        return (
          <li key={date} className={`${state}${date === today ? ' today' : ''}`} aria-label={label}>
            <span aria-hidden="true">{WEEKDAY_LETTERS[i]}</span>
            <span className="week-day" aria-hidden="true">
              {parseLocalDate(date).getDate()}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function DayCard({
  ref,
  day,
  tag,
  weekNumber,
  exercises,
  done,
  onStart,
}: {
  ref: Ref<HTMLElement>
  day: RoutineDay
  tag: string
  weekNumber: number
  exercises: Map<string, Exercise>
  done: boolean
  onStart: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const summary = daySummary(day, weekNumber)
  const items = [...day.exercises].sort((a, b) => a.position - b.position)
  // Con uno solo de más no vale la pena esconderlo
  const collapsible = items.length > PREVIEW_ITEMS + 1
  const visible = collapsible && !expanded ? items.slice(0, PREVIEW_ITEMS) : items

  return (
    <section ref={ref} className="card stack day-card" aria-labelledby="day-title">
      <div className="day-card-tags">
        <span className="badge">{tag}</span>
        {done && (
          <span className="badge badge-ok">
            <Icon name="check" size={14} />
            Ya la hiciste hoy
          </span>
        )}
      </div>
      <h2 id="day-title" className="day-title">
        {day.name}
      </h2>
      <ul className="day-stats">
        <li>
          <Icon name="dumbbell" size={16} />
          {summary.exercises} ejercicios
        </li>
        <li>
          <Icon name="layers" size={16} />
          {summary.sets} series
        </li>
        <li>
          <Icon name="clock" size={16} />
          <span>
            <span className="sr-only">Duración estimada: </span>
            {durationText(summary.minutes)}
          </span>
        </li>
      </ul>
      {items.length > 0 && (
        <div className="preview">
          <ol aria-label="Ejercicios">
            {visible.map((item) => (
              <li key={item.id}>
                <span className="preview-name">
                  {exercises.get(item.exercise_id)?.name ?? 'Ejercicio'}
                </span>
                <span className="preview-sets">
                  {targetSets(item, weekNumber)} × {range(item.reps_min, item.reps_max)}
                </span>
              </li>
            ))}
          </ol>
          {collapsible && (
            <button
              type="button"
              className="preview-more"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Ver menos' : `Ver los ${items.length} ejercicios`}
              <Icon name="chevron" size={16} />
            </button>
          )}
        </div>
      )}
      <button type="button" className={done ? 'tinted big' : 'primary big'} onClick={onStart}>
        <Icon name="play" size={18} />
        {done ? 'Hacerla de nuevo' : 'Empezar'}
      </button>
    </section>
  )
}

function OpenSession({
  session,
  day,
  setsDone,
  weekNumber,
}: {
  session: Session
  day: RoutineDay | undefined
  setsDone: number
  weekNumber: number
}) {
  const navigate = useNavigate()
  const planned = day ? day.exercises.reduce((n, item) => n + targetSets(item, weekNumber), 0) : 0
  const details = [
    session.started_at ? `Desde las ${timeOfDay(session.started_at)}` : null,
    planned ? `${setsDone} de ${planned} series` : `${setsDone} series`,
  ].filter(Boolean)

  return (
    <section className="card stack" aria-labelledby="open-title">
      <span className="live">
        <span className="live-dot" aria-hidden="true" />
        En curso
      </span>
      <h2 id="open-title" className="day-title">
        {day?.name ?? 'Sesión de hoy'}
      </h2>
      <p className="muted subhead">{details.join(' · ')}</p>
      {planned > 0 && (
        <div
          className="progress"
          role="progressbar"
          aria-label="Series hechas"
          aria-valuemin={0}
          aria-valuemax={planned}
          aria-valuenow={Math.min(setsDone, planned)}
        >
          <span style={{ width: `${Math.min(100, (setsDone / planned) * 100)}%` }} />
        </div>
      )}
      <button
        type="button"
        className="primary big"
        onClick={() => navigate(`/sesion/${session.id}`)}
      >
        <Icon name="play" size={18} />
        Seguir la sesión
      </button>
    </section>
  )
}

function RestCard({ next, weekday }: { next: RoutineDay | undefined; weekday: number }) {
  const when =
    next?.weekday && next.weekday === (weekday % 7) + 1
      ? 'Mañana'
      : next?.weekday
        ? `El ${weekdayName(next.weekday)}`
        : null

  return (
    <section className="card stack rest-card" aria-labelledby="rest-title">
      <span className="symbol">
        <Icon name="moon" size={30} />
      </span>
      <h2 id="rest-title">Hoy es día de descanso</h2>
      {next && when && (
        <p className="muted subhead">
          {when} toca {next.name}.
        </p>
      )}
    </section>
  )
}

function FirstUse({ hasSynced }: { hasSynced: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function importRoutine() {
    setBusy(true)
    setError(null)
    try {
      await request('/routines/import', { method: 'POST' })
      await syncNow()
    } catch (err) {
      setError(
        err instanceof NetworkError
          ? 'Sin conexión. La primera carga necesita internet.'
          : err instanceof ApiError
            ? err.message
            : 'No se pudo importar la rutina.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="empty-state" aria-labelledby="empty-title">
      <span className="symbol">
        <Icon name="dumbbell" size={32} />
      </span>
      <h2 id="empty-title">Todavía no hay rutina</h2>
      <p className="muted subhead">
        {hasSynced
          ? 'Cargá tu rutina vigente (rutina-2026-10-20) con sus 5 días.'
          : 'Si ya la importaste en otro dispositivo, va a aparecer al sincronizar.'}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        type="button"
        className="primary big"
        disabled={busy}
        onClick={() => void importRoutine()}
      >
        {busy ? 'Importando…' : 'Importar rutina'}
      </button>
    </section>
  )
}
