import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useExerciseHistory } from '../data/hooks'
import { db } from '../db/db'
import { addDays } from '../data/calendar'
import { dayMonth, localDate, shortDate } from '../lib/dates'
import { decimal, kg, setText } from '../lib/format'
import { compareSets, E1RM_MAX_REPS, sessionSeries, type SessionPoint } from '../metrics'
import Icon from './Icon'
import TrendChart from './TrendChart'
import TrendMark from './TrendMark'

const METRICS = {
  e1rm: { label: '1RM estimado', unit: 'kg', format: decimal },
  maxWeight: { label: 'Peso máximo', unit: 'kg', format: kg },
  volume: { label: 'Volumen (kg × reps)', unit: null, format: decimal },
} as const
type Metric = keyof typeof METRICS

const RANGES = [
  { label: '4 sem', days: 28 },
  { label: '3 meses', days: 91 },
  { label: 'Todo', days: null },
] as const

const signed = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

/** Gráfico de un ejercicio con tres métricas y rango de fechas (US-13). */
export default function ExerciseProgress() {
  // Solo los ejercicios con series registradas, por nombre
  const exercises = useLiveQuery(async () => {
    const withSets = new Set(
      (await db.set_logs.toArray()).filter((s) => !s.deleted_at).map((s) => s.exercise_id),
    )
    return (await db.exercises.toArray())
      .filter((e) => withSets.has(e.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [])
  const [exerciseId, setExerciseId] = useState<string | null>(null)
  const [metric, setMetric] = useState<Metric>('e1rm')
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[0])
  // La sesión elegida, en el gráfico o en la lista: el número grande y su detalle la siguen
  const [selected, setSelected] = useState<string | null>(null)
  const current = exercises?.find((e) => e.id === exerciseId) ?? exercises?.[0]
  const history = useExerciseHistory(current?.id)

  if (!exercises) return null
  if (!current)
    return (
      <div className="empty-state">
        <span className="symbol">
          <Icon name="chart" size={30} />
        </span>
        <h2>Todavía no hay series</h2>
        <p className="muted">Cuando anotes series, acá vas a ver cómo sube cada ejercicio.</p>
      </div>
    )

  const all = sessionSeries(history ?? [], current.e1rm_eligible)
  // Sin 1RM estimado (dominadas, o series de más de 12 repeticiones) arranca en peso máximo
  const hasE1rm = all.some((p) => p.e1rm !== null)
  const shown: Metric = metric === 'e1rm' && !hasE1rm ? 'maxWeight' : metric
  const { unit, format } = METRICS[shown]
  const since = range.days ? addDays(localDate(), -range.days) : null
  const inRange = all.filter((p) => !since || p.date >= since)
  const chart = inRange.flatMap((p) => {
    const value = p[shown]
    return value === null
      ? []
      : [{ key: p.sessionId, label: dayMonth(p.date), value, date: p.date }]
  })
  const focus = chart.find((p) => p.key === selected) ?? chart.at(-1)
  const note = headlineNote(chart, focus, selected, unit)
  const best = (p: SessionPoint) =>
    p.sets.reduce((a, b) => (compareSets(b, a, current.e1rm_eligible) === 'up' ? b : a))

  return (
    <section aria-label="Progreso por ejercicio">
      <label className="select-row">
        <span className="sr-only">Ejercicio</span>
        <select
          value={current.id}
          onChange={(e) => {
            setExerciseId(e.target.value)
            setSelected(null)
          }}
        >
          {exercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <Icon name="chevronUpDown" size={18} className="select-row-icon" />
      </label>

      {history !== undefined && (
        <div className="card chart-card">
          <div className="segmented compact" role="group" aria-label="Rango">
            {RANGES.map((r) => (
              <button
                key={r.label}
                type="button"
                aria-pressed={range === r}
                onClick={() => setRange(r)}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Se ve el texto con su flecha; el select nativo va encima, transparente, así el
              ancho es el de la opción elegida y no el de la más larga */}
          <label className="metric-select">
            <span className="sr-only">Métrica</span>
            <span className="metric-select-text" aria-hidden="true">
              {METRICS[shown].label}
              <Icon name="chevronUpDown" size={14} />
            </span>
            <select value={shown} onChange={(e) => setMetric(e.target.value as Metric)}>
              {(Object.keys(METRICS) as Metric[]).map((key) => (
                <option key={key} value={key} disabled={key === 'e1rm' && !hasE1rm}>
                  {METRICS[key].label}
                </option>
              ))}
            </select>
          </label>

          {focus ? (
            <>
              <p className="headline">
                <span className="headline-value">{format(focus.value)}</span>
                {unit && <span className="headline-unit">{unit}</span>}
              </p>
              <p className={`headline-note${note.tone ? ` ${note.tone}` : ''}`}>{note.text}</p>
              <TrendChart
                points={chart}
                selected={focus.key}
                onSelect={setSelected}
                label={`${METRICS[shown].label}: ${chart.length} sesiones`}
              />
            </>
          ) : (
            <p className="muted chart-empty">Sin sesiones en este rango.</p>
          )}

          {!hasE1rm && all.length > 0 && (
            <p className="footnote muted">
              {current.e1rm_eligible
                ? `Sin 1RM estimado: las series pasan de ${E1RM_MAX_REPS} repeticiones.`
                : 'Sin 1RM estimado: es con el peso del cuerpo.'}
            </p>
          )}
        </div>
      )}

      {inRange.length > 0 && (
        <>
          <h2 id="sessions-title" className="group-header">
            Sesiones
          </h2>
          <ol className="grouped" aria-labelledby="sessions-title">
            {[...inRange].reverse().map((point) => {
              const previous = all[all.indexOf(point) - 1]
              const open = point.sessionId === selected
              return (
                <li key={point.sessionId}>
                  <button
                    type="button"
                    className="grouped-row"
                    aria-expanded={open}
                    onClick={() => setSelected(open ? null : point.sessionId)}
                  >
                    <span className="grouped-row-text">
                      <span>{shortDate(point.date)}</span>
                      <span className="muted subhead">
                        {point.sets.map((s) => setText(s.weight_kg, s.reps)).join(' · ')}
                      </span>
                    </span>
                    {previous && (
                      <TrendMark
                        trend={compareSets(best(point), best(previous), current.e1rm_eligible)}
                      />
                    )}
                    <Icon name="chevron" size={18} className="chevron disclosure" />
                  </button>
                  {open && <SessionDetail point={point} />}
                </li>
              )
            })}
          </ol>
        </>
      )}
    </section>
  )
}

/**
 * La línea debajo del número grande: la fecha de la sesión elegida, o cuánto cambió desde la
 * primera sesión del rango.
 */
function headlineNote(
  chart: { key: string; value: number; date: string }[],
  focus: { key: string; value: number; date: string } | undefined,
  selected: string | null,
  unit: string | null,
): { text: string; tone?: 'up' | 'down' } {
  const first = chart[0]
  if (!focus || !first) return { text: '' }
  if (focus.key === selected) return { text: shortDate(focus.date) }
  if (chart.length === 1) return { text: 'Una sola sesión en este rango' }
  const diff = focus.value - first.value
  if (Math.abs(diff) < 0.05) return { text: `Igual que el ${dayMonth(first.date)}` }
  return {
    text: `${signed.format(diff)}${unit ? ` ${unit}` : ''} desde el ${dayMonth(first.date)}`,
    tone: diff > 0 ? 'up' : 'down',
  }
}

function SessionDetail({ point }: { point: SessionPoint }) {
  return (
    <section className="row-detail" aria-label={`Sesión del ${shortDate(point.date)}`}>
      <ol className="set-lines">
        {point.sets.map((s) => (
          <li key={s.id}>
            <span className="muted">Serie {s.set_number}</span>
            <span>
              {kg(s.weight_kg)} kg × {s.reps}
            </span>
            <span className="muted">{s.rir === null ? 'sin RIR' : `RIR ${s.rir}`}</span>
          </li>
        ))}
      </ol>
      <p className="muted footnote">
        {point.e1rm ? `1RM ≈ ${decimal(point.e1rm)} kg · ` : ''}volumen {decimal(point.volume)}
      </p>
    </section>
  )
}
