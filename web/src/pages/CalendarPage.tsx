import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router'
import Icon from '../components/Icon'
import Ring from '../components/Ring'
import {
  byDate,
  missedPlanned,
  monthGrid,
  plannedWeekdays,
  trainedSessions,
  weekStats,
  type WeekStats,
} from '../data/calendar'
import { useCurrentRoutine } from '../data/hooks'
import { db } from '../db/db'
import type { LocalDate, Routine, Session } from '../db/types'
import { saveRow } from '../db/write'
import {
  isoWeekday,
  localDate,
  longDate,
  mediumDate,
  monthTitle,
  parseLocalDate,
  shortDate,
} from '../lib/dates'
import { decimal } from '../lib/format'
import { useSwipe } from '../lib/swipe'

const WEEKDAY_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

export default function CalendarPage() {
  const today = localDate()
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  // De qué lado entra el mes nuevo, para la animación
  const [direction, setDirection] = useState<'next' | 'prev' | null>(null)
  const [selected, setSelected] = useState<LocalDate | null>(null)
  // Deslizar de costado cambia de mes; lo vertical sigue siendo scroll
  const swipe = useSwipe((direction) => move(direction))
  const routine = useCurrentRoutine()
  const data = useLiveQuery(async () => {
    const sessions = (await db.sessions.toArray()).filter((s) => !s.deleted_at)
    const setsBySession = new Map<string, number>()
    for (const set of await db.set_logs.toArray()) {
      if (!set.deleted_at)
        setsBySession.set(set.session_id, (setsBySession.get(set.session_id) ?? 0) + 1)
    }
    // Los nombres de los días de todas las versiones: una sesión vieja apunta a la suya
    const dayNames = new Map(
      (await db.routines.toArray()).flatMap((r) => r.days.map((d) => [d.id, d.name] as const)),
    )
    return { sessions, setsBySession, dayNames }
  }, [])

  if (!data || routine === undefined) return null

  const trained = trainedSessions(data.sessions, data.setsBySession)
  const trainedByDate = byDate(trained)
  const trainedDates = new Set(trainedByDate.keys())
  const days = data.dayNames
  const stats = weekStats(trained, plannedWeekdays(routine).size, today)
  const grid = monthGrid(month.year, month.month)
  const now = parseLocalDate(today)
  const isCurrentMonth = month.year === now.getFullYear() && month.month === now.getMonth()
  // Sin elegir, el detalle es el de hoy
  const shown = selected ?? today

  function move(delta: number) {
    const date = new Date(month.year, month.month + delta, 1)
    setMonth({ year: date.getFullYear(), month: date.getMonth() })
    setDirection(delta > 0 ? 'next' : 'prev')
    setSelected(null)
  }

  function goToday() {
    setDirection(
      month.year * 12 + month.month > now.getFullYear() * 12 + now.getMonth() ? 'prev' : 'next',
    )
    setMonth({ year: now.getFullYear(), month: now.getMonth() })
    setSelected(null)
  }

  return (
    <main>
      <header className="page-header">
        <h1>Calendario</h1>
      </header>

      <div className="month-header">
        <h2 aria-live="polite">{monthTitle(month.year, month.month)}</h2>
        <div className="month-nav">
          {!isCurrentMonth && (
            <button type="button" className="link" onClick={goToday}>
              Hoy
            </button>
          )}
          <button type="button" className="link" aria-label="Mes anterior" onClick={() => move(-1)}>
            <Icon name="chevronLeft" size={22} />
          </button>
          <button type="button" className="link" aria-label="Mes siguiente" onClick={() => move(1)}>
            <Icon name="chevron" size={22} />
          </button>
        </div>
      </div>

      <table className="calendar" {...swipe}>
        <thead>
          <tr>
            {WEEKDAY_HEADERS.map((d) => (
              <th key={d} scope="col">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody
          key={`${month.year}-${month.month}`}
          className={direction ? `from-${direction}` : undefined}
        >
          {grid.map((week, i) => (
            <tr key={i}>
              {week.map((date, j) => {
                if (!date) return <td key={j} />
                const done = trainedDates.has(date)
                const missed = missedPlanned(date, routine, trainedDates, today)
                const names = (trainedByDate.get(date) ?? [])
                  .map((s) => days.get(s.routine_day_id ?? '') ?? 'Sesión')
                  .join(', ')
                const label = `${shortDate(date)}${done ? `: entrenado, ${names}` : missed ? ': planificado y no hecho' : ''}`
                return (
                  <td key={j}>
                    <button
                      type="button"
                      className={`day${date === today ? ' today' : ''}${done ? ' done' : missed ? ' missed' : ''}`}
                      aria-label={label}
                      aria-pressed={date === shown}
                      onClick={() => setSelected(date)}
                    >
                      <span className="day-number">{parseLocalDate(date).getDate()}</span>
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="calendar-legend footnote muted">
        <span className="done">Entrenado</span>
        <span className="missed">Planificado y no hecho</span>
      </p>

      <DayDetail
        date={shown}
        today={today}
        routine={routine}
        sessions={trainedByDate.get(shown) ?? []}
        setsBySession={data.setsBySession}
        dayNames={days}
      />

      <Summary stats={stats} />
    </main>
  )
}

function DayDetail({
  date,
  today,
  routine,
  sessions,
  setsBySession,
  dayNames,
}: {
  date: LocalDate
  today: LocalDate
  routine: Routine | null
  sessions: Session[]
  setsBySession: Map<string, number>
  dayNames: Map<string, string>
}) {
  return (
    <section className="day-detail" aria-labelledby="day-detail-title">
      <h2 id="day-detail-title" className="group-header">
        {longDate(parseLocalDate(date))}
      </h2>
      {sessions.length === 0 ? (
        <p className="grouped-empty">{emptyText(date, today, routine)}</p>
      ) : (
        sessions.map((session) => (
          <SessionSummary
            key={session.id}
            session={session}
            name={dayNames.get(session.routine_day_id ?? '') ?? 'Sesión'}
            sets={setsBySession.get(session.id) ?? 0}
          />
        ))
      )}
    </section>
  )
}

/** Qué tocaba un día sin sesión, según la rutina vigente. */
function emptyText(date: LocalDate, today: LocalDate, routine: Routine | null): string {
  const inRoutine = routine && (!routine.start_on || date >= routine.start_on)
  const planned = inRoutine
    ? routine.days.find((d) => d.weekday === isoWeekday(parseLocalDate(date)))
    : undefined
  if (!planned) return date >= today ? 'Día de descanso.' : 'Sin sesión registrada.'
  if (date < today) return `Tocaba ${planned.name}. No hay sesión registrada.`
  return date === today ? `Hoy toca ${planned.name}.` : `Toca ${planned.name}.`
}

function SessionSummary({ session, name, sets }: { session: Session; name: string; sets: number }) {
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(session.date)
  const exercises = useLiveQuery(
    async () =>
      new Set(
        (await db.set_logs.where('session_id').equals(session.id).toArray())
          .filter((s) => !s.deleted_at)
          .map((s) => s.exercise_id),
      ).size,
    [session.id],
  )

  function cancel() {
    setDate(session.date)
    setEditing(false)
  }

  return (
    <ul className="grouped" aria-label={`Sesión ${name}`}>
      <li>
        <Link to={`/sesion/${session.id}`} className="grouped-row">
          <span className="grouped-row-text">
            <span>{name}</span>
            <span className="muted subhead">
              {plural(exercises ?? 0, 'ejercicio', 'ejercicios')} ·{' '}
              {plural(sets, 'serie', 'series')}
            </span>
          </span>
          <Icon name="chevron" size={18} className="chevron" />
        </Link>
      </li>
      <li>
        {editing ? (
          <form
            className="date-edit"
            onSubmit={(e) => {
              e.preventDefault()
              if (date) void saveRow('sessions', { ...session, date }).then(() => setEditing(false))
            }}
          >
            <label>
              Fecha
              <input type="date" value={date} required onChange={(e) => setDate(e.target.value)} />
            </label>
            <div className="date-edit-actions">
              <button type="button" className="link" onClick={cancel}>
                Cancelar
              </button>
              <button type="submit" className="primary">
                Guardar
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="grouped-row"
            aria-label={`Cambiar la fecha (${mediumDate(session.date)})`}
            onClick={() => setEditing(true)}
          >
            <span className="grouped-row-text">Fecha</span>
            <span className="value-pill">{mediumDate(session.date)}</span>
          </button>
        )}
      </li>
    </ul>
  )
}

function Summary({ stats }: { stats: WeekStats }) {
  const { done, planned } = stats.thisWeek
  return (
    <section aria-labelledby="summary-title">
      <h2 id="summary-title" className="section-title">
        Resumen
      </h2>
      <dl className="stat-tiles">
        <div className="stat-tile">
          <Ring value={done} max={planned} />
          <dt>Sesiones esta semana</dt>
          <dd>
            {done} de {planned}
          </dd>
        </div>
        <div className="stat-tile">
          <span className="stat-flame">
            <Icon name="flame" size={30} />
          </span>
          <dt>{stats.streak === 1 ? 'Semana al día seguida' : 'Semanas al día seguidas'}</dt>
          <dd>{stats.streak}</dd>
        </div>
        <div className="stat-tile">
          <span className="stat-trend">
            <Icon name="chart" size={30} />
          </span>
          <dt>Sesiones por semana, últimas 3</dt>
          <dd>{decimal(stats.averageLast3)}</dd>
        </div>
      </dl>
    </section>
  )
}
