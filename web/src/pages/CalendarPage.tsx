import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router'
import {
  byDate,
  missedPlanned,
  monthGrid,
  plannedWeekdays,
  trainedSessions,
  weekStats,
} from '../data/calendar'
import { useCurrentRoutine } from '../data/hooks'
import { db } from '../db/db'
import type { LocalDate, Session } from '../db/types'
import { saveRow } from '../db/write'
import { localDate, parseLocalDate, shortDate } from '../lib/dates'
import { decimal } from '../lib/format'

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
  const [selected, setSelected] = useState<LocalDate | null>(null)
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
  const title = new Date(month.year, month.month, 1).toLocaleDateString('es-AR', {
    month: 'short',
    year: 'numeric',
  })

  function move(delta: number) {
    const date = new Date(month.year, month.month + delta, 1)
    setMonth({ year: date.getFullYear(), month: date.getMonth() })
    setSelected(null)
  }

  return (
    <main>
      <header className="page-header">
        <h1>Calendario</h1>
        <div className="month-nav">
          <button type="button" aria-label="Mes anterior" onClick={() => move(-1)}>
            ‹
          </button>
          <span>{title.replace('.', '')}</span>
          <button type="button" aria-label="Mes siguiente" onClick={() => move(1)}>
            ›
          </button>
        </div>
      </header>

      <table className="calendar">
        <thead>
          <tr>
            {WEEKDAY_HEADERS.map((d) => (
              <th key={d} scope="col">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
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
                      className={`day${date === today ? ' today' : ''}`}
                      aria-label={label}
                      aria-pressed={date === selected}
                      onClick={() => setSelected(date)}
                    >
                      {parseLocalDate(date).getDate()}
                      <span className="mark" aria-hidden="true">
                        {done ? '●' : missed ? '○' : ''}
                      </span>
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted legend">● entrenado · ○ planificado y no hecho</p>

      <dl className="stats">
        <dt>Esta semana</dt>
        <dd>
          {stats.thisWeek.done} de {plural(stats.thisWeek.planned, 'sesión', 'sesiones')}
        </dd>
        <dt>Racha</dt>
        <dd>{plural(stats.streak, 'semana al día', 'semanas al día')}</dd>
        <dt>Últimas 3 semanas</dt>
        <dd>{decimal(stats.averageLast3)} sesiones/sem</dd>
      </dl>

      {selected && (
        <DaySummary
          date={selected}
          sessions={trainedByDate.get(selected) ?? []}
          setsBySession={data.setsBySession}
          dayNames={days}
        />
      )}
    </main>
  )
}

function DaySummary({
  date,
  sessions,
  setsBySession,
  dayNames,
}: {
  date: LocalDate
  sessions: Session[]
  setsBySession: Map<string, number>
  dayNames: Map<string, string>
}) {
  if (sessions.length === 0) {
    return <p className="card muted">{shortDate(date)}: sin sesión registrada.</p>
  }
  return (
    <>
      {sessions.map((session) => (
        <SessionSummary
          key={session.id}
          session={session}
          name={dayNames.get(session.routine_day_id ?? '') ?? 'Sesión'}
          sets={setsBySession.get(session.id) ?? 0}
        />
      ))}
    </>
  )
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

  return (
    <section className="card" aria-label={`Sesión ${name}`}>
      <Link to={`/sesion/${session.id}`} className="session-link">
        {shortDate(session.date)} · {name} ›
      </Link>
      <p className="muted">
        {plural(exercises ?? 0, 'ejercicio', 'ejercicios')} · {plural(sets, 'serie', 'series')}
      </p>
      {editing ? (
        <form
          className="date-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (date) void saveRow('sessions', { ...session, date }).then(() => setEditing(false))
          }}
        >
          <label>
            Fecha
            <input type="date" value={date} required onChange={(e) => setDate(e.target.value)} />
          </label>
          <button type="submit" className="primary">
            Guardar
          </button>
        </form>
      ) : (
        <button type="button" className="link" onClick={() => setEditing(true)}>
          Cambiar la fecha
        </button>
      )}
    </section>
  )
}
