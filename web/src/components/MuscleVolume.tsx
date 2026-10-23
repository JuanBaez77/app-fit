import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { addDays } from '../data/calendar'
import { useCurrentRoutine } from '../data/hooks'
import { db } from '../db/db'
import type { Exercise, LocalDate, MuscleTarget, Session, SetLog } from '../db/types'
import { localDate, shortDate } from '../lib/dates'
import { decimal } from '../lib/format'
import { volumeSources, weekStart, weeklyVolume, type WeeklyVolume } from '../metrics'

/** Semanas que muestra la tendencia de un músculo, contando la elegida. */
const TREND_WEEKS = 6

interface VolumeData {
  sets: SetLog[]
  sessions: Map<string, Session>
  exercises: Map<string, Exercise>
  /** muscle_id -> nombre */
  muscles: Map<string, string>
}

/** "deltoides_lateral" -> "deltoides lateral", si el músculo no llegó del catálogo. */
const fallbackName = (id: string) => id.replace(/_/g, ' ')

/** Meta de series fraccionales: la de la tabla de la rutina, o las directas si no tiene. */
const goalOf = (target: MuscleTarget | undefined) =>
  target ? (target.fractional_target ?? target.target_sets) : null

/** Series fraccionales de la semana contra la meta de la rutina vigente (US-14). */
export default function MuscleVolume() {
  const routine = useCurrentRoutine()
  const data = useLiveQuery(async (): Promise<VolumeData> => {
    const [sets, sessions, exercises, muscles] = await Promise.all([
      db.set_logs.toArray(),
      db.sessions.toArray(),
      db.exercises.toArray(),
      db.muscles.toArray(),
    ])
    return {
      sets,
      sessions: new Map(sessions.map((s) => [s.id, s])),
      exercises: new Map(exercises.map((e) => [e.id, e])),
      muscles: new Map(muscles.map((m) => [m.id, m.name])),
    }
  }, [])
  const thisWeek = weekStart(localDate())
  const [week, setWeek] = useState<LocalDate>(thisWeek)
  const [selected, setSelected] = useState<string | null>(null)

  if (!data || routine === undefined) return null

  const weeks = weeklyVolume(data.sets, data.sessions, data.exercises)
  const volume = weeks.get(week) ?? {}
  const targets = new Map((routine?.muscle_targets ?? []).map((t) => [t.muscle_id, t]))
  const name = (id: string) => data.muscles.get(id) ?? fallbackName(id)
  // Primero los de la tabla de la rutina, en su orden; después los que tuvieron series sin meta
  const muscleIds = [
    ...targets.keys(),
    ...Object.keys(volume)
      .filter((id) => !targets.has(id))
      .sort((a, b) => name(a).localeCompare(name(b), 'es')),
  ]

  function move(delta: number) {
    setWeek(addDays(week, 7 * delta))
  }

  return (
    <section aria-label="Volumen por músculo">
      <div className="week-nav">
        <button type="button" aria-label="Semana anterior" onClick={() => move(-1)}>
          ‹
        </button>
        <span>{week === thisWeek ? 'Esta semana' : `Semana del ${shortDate(week)}`}</span>
        <button
          type="button"
          aria-label="Semana siguiente"
          disabled={week >= thisWeek}
          onClick={() => move(1)}
        >
          ›
        </button>
      </div>
      <p className="muted legend">Series fraccionales: la indirecta vale 0,5.</p>

      {muscleIds.length === 0 ? (
        <p className="muted">La rutina vigente no tiene tabla de volumen por músculo.</p>
      ) : (
        <ul className="muscle-list" aria-label="Músculos">
          {muscleIds.map((id) => {
            const done = volume[id]?.fractional ?? 0
            const goal = goalOf(targets.get(id))
            const open = id === selected
            return (
              <li key={id}>
                <button
                  type="button"
                  className="muscle-row"
                  aria-expanded={open}
                  onClick={() => setSelected(open ? null : id)}
                >
                  <span className="muscle-name">{name(id)}</span>
                  <span className="muscle-count">
                    {goal === null ? decimal(done) : `${decimal(done)} de ${decimal(goal)}`}
                  </span>
                  <span className="bar" aria-hidden="true">
                    <span
                      className={goal !== null && done >= goal ? 'bar-fill met' : 'bar-fill'}
                      style={{ width: `${goal ? Math.min(done / goal, 1) * 100 : 0}%` }}
                    />
                  </span>
                </button>
                {open && (
                  <MuscleDetail
                    muscleId={id}
                    name={name(id)}
                    week={week}
                    weeks={weeks}
                    target={targets.get(id)}
                    data={data}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function MuscleDetail({
  muscleId,
  name,
  week,
  weeks,
  target,
  data,
}: {
  muscleId: string
  name: string
  week: LocalDate
  weeks: Map<LocalDate, WeeklyVolume>
  target: MuscleTarget | undefined
  data: VolumeData
}) {
  const sources = volumeSources(data.sets, data.sessions, data.exercises, week, muscleId)
  const direct = weeks.get(week)?.[muscleId]?.direct ?? 0
  const goal = goalOf(target)
  const trend = Array.from({ length: TREND_WEEKS }, (_, i) => {
    const monday = addDays(week, -7 * (TREND_WEEKS - 1 - i))
    return { week: monday, value: weeks.get(monday)?.[muscleId]?.fractional ?? 0 }
  })
  const top = Math.max(goal ?? 0, ...trend.map((t) => t.value), 1)

  return (
    <section className="card muscle-detail" aria-label={`Detalle de ${name}`}>
      <p>
        Directas: {direct}
        {target && target.range_min !== null
          ? ` · rango ${target.range_min}–${target.range_max ?? target.range_min}`
          : ''}
        {target?.priority ? ` · prioridad ${target.priority}` : ''}
      </p>

      <h3>Ejercicios de la semana</h3>
      {sources.length === 0 ? (
        <p className="muted">Sin series esta semana.</p>
      ) : (
        <ul className="sources">
          {sources.map((s) => (
            <li key={s.exercise_id}>
              {data.exercises.get(s.exercise_id)?.name ?? 'Ejercicio'}: {s.sets}{' '}
              {s.sets === 1 ? 'serie' : 'series'} × {decimal(s.factor)} ={' '}
              {decimal(s.sets * s.factor)}
            </li>
          ))}
        </ul>
      )}

      <h3>Últimas semanas</h3>
      <ol className="trend-weeks">
        {trend.map((t) => (
          <li key={t.week}>
            <span className="muted">{shortDate(t.week)}</span>
            <span className="bar" aria-hidden="true">
              <span
                className={goal !== null && t.value >= goal ? 'bar-fill met' : 'bar-fill'}
                style={{ width: `${(t.value / top) * 100}%` }}
              />
            </span>
            <span>{decimal(t.value)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
