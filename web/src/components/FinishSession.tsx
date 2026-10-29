import { useState, type FormEvent } from 'react'
import type { SessionClose } from '../data/sessions'

function parseHours(text: string): number | null | 'invalid' {
  if (!text.trim()) return null
  const value = Number(text.replace(',', '.'))
  return Number.isFinite(value) && value >= 0 && value <= 24 ? value : 'invalid'
}

/**
 * Cierre de la sesión, en una hoja: el resumen y dos filas opcionales, horas de sueño y
 * molestias, como un formulario de Ajustes de iOS.
 */
export default function FinishSession({
  summary,
  onFinish,
  onCancel,
}: {
  /** "4 ejercicios · 14 series · 52 min" */
  summary: string
  onFinish: (close: SessionClose) => Promise<unknown>
  onCancel: () => void
}) {
  const [hours, setHours] = useState('')
  const [discomfort, setDiscomfort] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const sleep = parseHours(hours)
    if (sleep === 'invalid') {
      setError('Las horas de sueño van de 0 a 24.')
      return
    }
    await onFinish({ sleep_hours: sleep, discomfort: discomfort || null })
  }

  return (
    <form className="finish" aria-label="Terminar la sesión" onSubmit={(e) => void submit(e)}>
      <p className="finish-summary">{summary}</p>
      <ul className="grouped">
        <li>
          <label className="form-row">
            Horas de sueño anoche
            <input
              inputMode="decimal"
              placeholder="7,5"
              value={hours}
              onChange={(e) => {
                setHours(e.target.value)
                setError(null)
              }}
            />
          </label>
        </li>
        <li>
          <label className="form-row stacked">
            Molestias
            <input
              placeholder="Ej.: hombro derecho al bajar en el press"
              maxLength={2000}
              value={discomfort}
              onChange={(e) => setDiscomfort(e.target.value)}
            />
          </label>
        </li>
      </ul>
      <p className="list-footer footnote muted">
        Las dos son opcionales. Las molestias solo viajan al análisis del brain si lo activás en
        Ajustes.
      </p>
      {error && (
        <p role="alert" className="error list-footer">
          {error}
        </p>
      )}
      <button type="submit" className="primary big">
        Terminar sesión
      </button>
      <button type="button" className="link finish-cancel" onClick={onCancel}>
        Seguir entrenando
      </button>
    </form>
  )
}
