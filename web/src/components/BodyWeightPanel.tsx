import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { saveWeight } from '../data/bodyWeights'
import { db } from '../db/db'
import type { BodyWeight, LocalDate } from '../db/types'
import { dayMonth, localDate, weekRange } from '../lib/dates'
import { decimal, kg } from '../lib/format'
import { weeklyWeights, weekStart } from '../metrics'
import Icon from './Icon'
import TrendChart from './TrendChart'

/** Semanas que muestran el gráfico y el historial de promedios. */
const WEEKS_SHOWN = 8

const percent = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

function parseKg(text: string): number | null {
  const value = Number(text.replace(',', '.').trim())
  return text.trim() && Number.isFinite(value) && value > 0 && value < 1000 ? value : null
}

/** Peso corporal: el promedio por semana con su gráfico, y el peso de hoy (US-15). */
export default function BodyWeightPanel() {
  const today = localDate()
  const weights = useLiveQuery(
    async () => (await db.body_weights.toArray()).filter((w) => !w.deleted_at),
    [],
  )
  // La semana elegida en el gráfico; sin elegir, la más nueva
  const [selected, setSelected] = useState<LocalDate | null>(null)

  if (!weights) return null

  const thisWeek = weekStart(today)
  const weeks = weeklyWeights(weights).slice(0, WEEKS_SHOWN)
  const focus = weeks.find((w) => w.week === selected) ?? weeks[0]
  const latest = weights.reduce<BodyWeight | undefined>(
    (a, b) => (!a || b.date > a.date ? b : a),
    undefined,
  )
  const weekName = (monday: LocalDate) => (monday === thisWeek ? 'Esta semana' : weekRange(monday))

  return (
    <section aria-label="Peso corporal">
      {focus && (
        <div className="card chart-card">
          <p className="metric-label">
            {focus.week === thisWeek
              ? 'Promedio de esta semana'
              : `Promedio, ${weekRange(focus.week)}`}
          </p>
          <p className="headline">
            <span className="headline-value">{decimal(focus.average)}</span>
            <span className="headline-unit">kg</span>
          </p>
          <p className="headline-note">
            {focus.change === null
              ? 'Sin pesajes la semana anterior'
              : `${percent.format(focus.change)} % contra la anterior`}
          </p>
          {weeks.length > 1 && (
            <TrendChart
              points={[...weeks].reverse().map((w) => ({
                key: w.week,
                label: dayMonth(w.week),
                value: w.average,
              }))}
              selected={focus.week}
              onSelect={setSelected}
              label={`Promedio por semana: ${weeks.length} semanas`}
              color="var(--blue)"
            />
          )}
        </div>
      )}

      <TodayWeight
        today={today}
        todays={weights.find((w) => w.date === today)}
        placeholder={latest ? kg(latest.kg) : '82,4'}
      />

      {weeks.length === 0 ? (
        <p className="grouped-empty weights-empty">Todavía no hay pesos cargados.</p>
      ) : (
        <>
          <h2 id="weight-weeks-title" className="group-header">
            Promedio por semana
          </h2>
          <ul className="grouped" aria-labelledby="weight-weeks-title">
            {weeks.map((w) => (
              <li key={w.week} className="grouped-row">
                <span className="grouped-row-text">
                  <span>{weekName(w.week)}</span>
                  <span className="muted subhead">
                    {w.count} {w.count === 1 ? 'pesaje' : 'pesajes'}
                  </span>
                </span>
                <span className="row-value">
                  <span>{decimal(w.average)} kg</span>
                  <span className="muted subhead">
                    {w.change === null ? '—' : `${percent.format(w.change)} %`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** El peso de hoy en una fila que se edita en el lugar, como la fecha en el Calendario. */
function TodayWeight({
  today,
  todays,
  placeholder,
}: {
  today: LocalDate
  todays: BodyWeight | undefined
  placeholder: string
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  function edit() {
    setText(todays ? kg(todays.kg) : '')
    setMessage(null)
    setEditing(true)
  }

  function cancel() {
    setMessage(null)
    setEditing(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const value = parseKg(text)
    if (value === null) {
      setMessage({ ok: false, text: 'Escribí el peso en kg, por ejemplo 82,4.' })
      return
    }
    await saveWeight(today, value)
    setEditing(false)
    setMessage({ ok: true, text: `Guardado: ${kg(value)} kg` })
  }

  return (
    <div className="today-weight">
      <ul className="grouped">
        <li>
          {editing ? (
            <form className="date-edit" onSubmit={(e) => void submit(e)}>
              <label>
                Peso de hoy (kg)
                <input
                  inputMode="decimal"
                  enterKeyHint="done"
                  placeholder={placeholder}
                  value={text}
                  // Se abre para escribir: que aparezca el teclado sin otro toque
                  autoFocus
                  onChange={(e) => {
                    setText(e.target.value)
                    setMessage(null)
                  }}
                />
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
          ) : todays ? (
            <button
              type="button"
              className="grouped-row"
              aria-label={`Cambiar el peso de hoy (${kg(todays.kg)} kg)`}
              onClick={edit}
            >
              <span className="grouped-row-text">Hoy</span>
              <span className="value-pill">{kg(todays.kg)} kg</span>
            </button>
          ) : (
            <button type="button" className="grouped-row add-row" onClick={edit}>
              <Icon name="plus" size={20} />
              <span className="grouped-row-text">Anotar el peso de hoy</span>
            </button>
          )}
        </li>
      </ul>
      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={`list-footer ${message.ok ? 'muted' : 'error'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
