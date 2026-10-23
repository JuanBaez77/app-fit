import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { saveWeight } from '../data/bodyWeights'
import { db } from '../db/db'
import { localDate, shortDate } from '../lib/dates'
import { decimal, kg } from '../lib/format'
import { weeklyWeights, weekStart } from '../metrics'

/** Semanas que muestra el historial de promedios. */
const WEEKS_SHOWN = 8

const percent = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

function parseKg(text: string): number | null {
  const value = Number(text.replace(',', '.').trim())
  return text.trim() && Number.isFinite(value) && value > 0 && value < 1000 ? value : null
}

/** Peso corporal: un campo para el de hoy y el promedio por semana (US-15). */
export default function BodyWeightPanel() {
  const today = localDate()
  const weights = useLiveQuery(
    async () => (await db.body_weights.toArray()).filter((w) => !w.deleted_at),
    [],
  )
  const [text, setText] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  if (!weights) return null

  const todays = weights.find((w) => w.date === today)
  const weeks = weeklyWeights(weights)
  const thisWeek = weeks.find((w) => w.week === weekStart(today))

  async function submit(event: FormEvent) {
    event.preventDefault()
    const value = parseKg(text)
    if (value === null) {
      setMessage({ ok: false, text: 'Escribí el peso en kg, por ejemplo 82,4.' })
      return
    }
    await saveWeight(today, value)
    setText('')
    setMessage({ ok: true, text: `Guardado: ${kg(value)} kg` })
  }

  return (
    <section aria-label="Peso corporal">
      <form className="weight-form" onSubmit={(e) => void submit(e)}>
        <label>
          Peso de hoy (kg)
          <input
            inputMode="decimal"
            placeholder={todays ? kg(todays.kg) : '82,4'}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setMessage(null)
            }}
          />
        </label>
        <button type="submit" className="primary">
          {todays ? 'Reemplazar' : 'Guardar'}
        </button>
      </form>
      {todays && !message && <p className="muted">Hoy ya cargaste {kg(todays.kg)} kg.</p>}
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'muted' : 'error'}>
          {message.text}
        </p>
      )}

      {weeks.length === 0 ? (
        <p className="muted">Todavía no hay pesos cargados.</p>
      ) : (
        <>
          <dl className="stats">
            <dt>Promedio de esta semana</dt>
            <dd>{thisWeek ? `${decimal(thisWeek.average)} kg` : '—'}</dd>
            <dt>Contra la semana anterior</dt>
            <dd>{thisWeek?.change != null ? `${percent.format(thisWeek.change)} %` : '—'}</dd>
          </dl>

          <h2 className="chart-title">Promedio por semana</h2>
          <table className="weight-weeks">
            <thead>
              <tr>
                <th scope="col">Semana</th>
                <th scope="col">Promedio</th>
                <th scope="col">Variación</th>
              </tr>
            </thead>
            <tbody>
              {weeks.slice(0, WEEKS_SHOWN).map((w) => (
                <tr key={w.week}>
                  <td>{shortDate(w.week)}</td>
                  <td>
                    {decimal(w.average)} kg{' '}
                    <span className="muted">
                      ({w.count} {w.count === 1 ? 'pesaje' : 'pesajes'})
                    </span>
                  </td>
                  <td>{w.change === null ? '—' : `${percent.format(w.change)} %`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
