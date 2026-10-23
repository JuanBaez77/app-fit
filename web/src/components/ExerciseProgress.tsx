import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useExerciseHistory } from '../data/hooks'
import { db } from '../db/db'
import { addDays } from '../data/calendar'
import { localDate, shortDate } from '../lib/dates'
import { decimal, kg, setText } from '../lib/format'
import { compareSets, sessionSeries, type SessionPoint } from '../metrics'
import TrendMark from './TrendMark'

const METRICS = {
  e1rm: { label: '1RM est.', title: '1RM estimado (kg)' },
  maxWeight: { label: 'Peso máx.', title: 'Peso máximo (kg)' },
  volume: { label: 'Volumen', title: 'Volumen (kg × reps)' },
} as const
type Metric = keyof typeof METRICS

const RANGES = [
  { label: '4 sem', days: 28 },
  { label: '3 meses', days: 91 },
  { label: 'Todo', days: null },
] as const

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
  const [selected, setSelected] = useState<string | null>(null)
  const current = exercises?.find((e) => e.id === exerciseId) ?? exercises?.[0]
  const history = useExerciseHistory(current?.id)

  if (!exercises) return null
  if (!current) return <p className="muted">Todavía no hay series registradas.</p>

  // Sin 1RM estimado (dominadas) el gráfico arranca en peso máximo
  const shown: Metric = metric === 'e1rm' && !current.e1rm_eligible ? 'maxWeight' : metric
  const since = range.days ? addDays(localDate(), -range.days) : null
  const all = sessionSeries(history ?? [], current.e1rm_eligible)
  const points = all.filter((p) => !since || p.date >= since)
  const data = points.map((p) => ({ ...p, label: shortDate(p.date), value: p[shown] }))
  const detail = points.find((p) => p.sessionId === selected)

  return (
    <section aria-label="Progreso por ejercicio">
      <label className="field">
        Ejercicio
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
      </label>

      <div className="segmented" role="group" aria-label="Métrica">
        {(Object.keys(METRICS) as Metric[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={shown === key}
            disabled={key === 'e1rm' && !current.e1rm_eligible}
            onClick={() => setMetric(key)}
          >
            {METRICS[key].label}
          </button>
        ))}
      </div>

      <h2 className="chart-title">{METRICS[shown].title}</h2>
      {history === undefined ? null : data.length === 0 ? (
        <p className="muted">Sin sesiones en este rango.</p>
      ) : (
        <div
          className="chart"
          role="img"
          aria-label={`${METRICS[shown].title}: ${data.length} sesiones`}
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--muted)' }} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12, fill: 'var(--muted)' }} />
              <Tooltip formatter={(value) => decimal(Number(value))} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--accent)"
                strokeWidth={2}
                connectNulls
                dot={{ r: 5 }}
                activeDot={{
                  r: 8,
                  onClick: (_event, item) => {
                    const point = (item as unknown as { payload?: SessionPoint }).payload
                    if (point) setSelected(point.sessionId)
                  },
                }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="segmented" role="group" aria-label="Rango">
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

      {detail && <SessionDetail point={detail} />}

      <ol className="session-history" aria-label="Sesiones">
        {[...points].reverse().map((point) => {
          const index = all.indexOf(point)
          const previous = all[index - 1]
          const best = (p: SessionPoint) =>
            p.sets.reduce((a, b) => (compareSets(b, a, current.e1rm_eligible) === 'up' ? b : a))
          return (
            <li key={point.sessionId}>
              <button
                type="button"
                aria-pressed={point.sessionId === selected}
                onClick={() => setSelected(point.sessionId)}
              >
                <span className="muted">{shortDate(point.date)}</span>
                <span>{point.sets.map((s) => setText(s.weight_kg, s.reps)).join('  ')}</span>
                {previous ? (
                  <TrendMark
                    trend={compareSets(best(point), best(previous), current.e1rm_eligible)}
                  />
                ) : (
                  <span />
                )}
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function SessionDetail({ point }: { point: SessionPoint }) {
  return (
    <section className="card" aria-label={`Sesión del ${shortDate(point.date)}`}>
      <strong>{shortDate(point.date)}</strong>
      <ol className="detail-sets">
        {point.sets.map((s) => (
          <li key={s.id}>
            Serie {s.set_number}: {kg(s.weight_kg)} kg × {s.reps}
            {s.rir === null ? ' · sin RIR' : ` · RIR ${s.rir}`}
          </li>
        ))}
      </ol>
      <p className="muted">
        {point.e1rm ? `1RM ≈ ${decimal(point.e1rm)} kg · ` : ''}volumen {decimal(point.volume)}
      </p>
    </section>
  )
}
