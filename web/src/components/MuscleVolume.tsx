import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { addDays } from '../data/calendar'
import { useCurrentRoutine } from '../data/hooks'
import { db } from '../db/db'
import type { Exercise, LocalDate, MuscleTarget, Session, SetLog } from '../db/types'
import { dayMonth, localDate, weekRange } from '../lib/dates'
import { decimal, range } from '../lib/format'
import { useSwipe } from '../lib/swipe'
import { volumeSources, weekStart, weeklyVolume, type WeeklyVolume } from '../metrics'
import Icon from './Icon'
import Ring from './Ring'

/** Semanas que muestra la tendencia de un músculo, contando la elegida. */
const TREND_WEEKS = 6

/** Los grupos de la lista, en orden: por la prioridad de la tabla de la rutina. */
const GROUPS = [
  { key: 'alta', title: 'Prioridad alta' },
  { key: 'media', title: 'Prioridad media' },
  { key: 'mantenimiento', title: 'Mantenimiento' },
  { key: 'otros', title: 'Otros de la rutina' },
  { key: 'sin-meta', title: 'Sin meta' },
] as const

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

const groupOf = (target: MuscleTarget | undefined) =>
  target ? (target.priority ?? 'otros') : 'sin-meta'

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
  // De qué lado entra la semana nueva, para la animación
  const [direction, setDirection] = useState<'next' | 'prev' | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const swipe = useSwipe((delta) => move(delta))

  function go(monday: LocalDate) {
    if (monday === week || monday > thisWeek) return
    setDirection(monday > week ? 'next' : 'prev')
    setWeek(monday)
  }

  function move(delta: number) {
    go(addDays(week, 7 * delta))
  }

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
  const done = (id: string) => volume[id]?.fractional ?? 0
  const withGoal = muscleIds.filter((id) => (goalOf(targets.get(id)) ?? 0) > 0)
  const met = withGoal.filter((id) => done(id) >= goalOf(targets.get(id))!).length

  return (
    <section aria-label="Volumen por músculo" className="swipe-area" {...swipe}>
      <div className="month-header">
        <h2 aria-live="polite">{week === thisWeek ? 'Esta semana' : weekRange(week)}</h2>
        <div className="month-nav">
          {week !== thisWeek && (
            <button type="button" className="link" onClick={() => go(thisWeek)}>
              Esta semana
            </button>
          )}
          <button
            type="button"
            className="link"
            aria-label="Semana anterior"
            onClick={() => move(-1)}
          >
            <Icon name="chevronLeft" size={22} />
          </button>
          <button
            type="button"
            className="link"
            aria-label="Semana siguiente"
            disabled={week >= thisWeek}
            onClick={() => move(1)}
          >
            <Icon name="chevron" size={22} />
          </button>
        </div>
      </div>

      <div key={week} className={direction ? `week-body from-${direction}` : 'week-body'}>
        {muscleIds.length === 0 ? (
          <p className="grouped-empty">La rutina vigente no tiene tabla de volumen por músculo.</p>
        ) : (
          <>
            {withGoal.length > 0 && (
              <div className="card volume-summary">
                <Ring value={met} max={withGoal.length} />
                <p>
                  <strong>
                    {met} de {withGoal.length}
                  </strong>
                  <span className="muted subhead">
                    {withGoal.length === 1 ? 'músculo en la meta' : 'músculos en la meta'}
                  </span>
                </p>
              </div>
            )}

            {GROUPS.map((group) => {
              const ids = muscleIds.filter((id) => groupOf(targets.get(id)) === group.key)
              if (ids.length === 0) return null
              return (
                <section key={group.key} aria-labelledby={`muscles-${group.key}`}>
                  <h3 id={`muscles-${group.key}`} className="group-header">
                    {group.title}
                  </h3>
                  <ul className="grouped" aria-labelledby={`muscles-${group.key}`}>
                    {ids.map((id) => {
                      const goal = goalOf(targets.get(id))
                      const open = id === selected
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            className="grouped-row muscle-item"
                            aria-expanded={open}
                            onClick={() => setSelected(open ? null : id)}
                          >
                            <span className="grouped-row-text">
                              <span className="muscle-line">
                                <span className="muscle-name">{name(id)}</span>
                                <span className="muscle-count">
                                  {decimal(done(id))}
                                  {goal !== null && (
                                    <span className="muted"> de {decimal(goal)}</span>
                                  )}
                                </span>
                              </span>
                              {goal !== null && (
                                <span className="bar" aria-hidden="true">
                                  <span
                                    className={done(id) >= goal ? 'bar-fill met' : 'bar-fill'}
                                    style={{
                                      width: `${goal ? Math.min(done(id) / goal, 1) * 100 : 0}%`,
                                    }}
                                  />
                                </span>
                              )}
                            </span>
                            <Icon name="chevron" size={18} className="chevron disclosure" />
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
                </section>
              )
            })}
            <p className="list-footer footnote muted">
              Series fraccionales: la indirecta vale 0,5.
            </p>
          </>
        )}
      </div>
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
  const directRange = target ? range(target.range_min, target.range_max) : null
  const trend = Array.from({ length: TREND_WEEKS }, (_, i) => {
    const monday = addDays(week, -7 * (TREND_WEEKS - 1 - i))
    return { week: monday, value: weeks.get(monday)?.[muscleId]?.fractional ?? 0 }
  })
  const top = Math.max(goal ?? 0, ...trend.map((t) => t.value), 1)

  return (
    <section className="row-detail" aria-label={`Detalle de ${name}`}>
      <dl className="mini-stats">
        <div>
          <dt>Directas</dt>
          <dd>{direct}</dd>
        </div>
        {directRange && (
          <div>
            <dt>Rango</dt>
            <dd>{directRange}</dd>
          </div>
        )}
        {goal !== null && (
          <div>
            <dt>Meta</dt>
            <dd>{decimal(goal)}</dd>
          </div>
        )}
      </dl>

      <h4 className="detail-title">Ejercicios de la semana</h4>
      {sources.length === 0 ? (
        <p className="muted subhead">Sin series esta semana.</p>
      ) : (
        <ul className="source-lines">
          {sources.map((s) => (
            <li key={s.exercise_id}>
              <span>{data.exercises.get(s.exercise_id)?.name ?? 'Ejercicio'}</span>
              <span className="muted">
                {s.sets} {s.sets === 1 ? 'serie' : 'series'}
                {s.factor !== 1 && ` · cuentan ${decimal(s.sets * s.factor)}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h4 className="detail-title">Últimas semanas</h4>
      <ol className="week-bars">
        {trend.map((t) => (
          <li key={t.week}>
            <span className="week-bar-value">{decimal(t.value)}</span>
            <span className="week-bar" aria-hidden="true">
              {goal !== null && (
                <span className="week-goal" style={{ bottom: `${(goal / top) * 100}%` }} />
              )}
              <span
                className={goal !== null && t.value >= goal ? 'week-bar-fill met' : 'week-bar-fill'}
                style={{ height: `${(t.value / top) * 100}%` }}
              />
            </span>
            <span className="muted footnote">{dayMonth(t.week)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
