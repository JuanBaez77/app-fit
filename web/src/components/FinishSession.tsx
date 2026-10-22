import { useState, type FormEvent } from 'react'
import type { SessionClose } from '../data/sessions'

function parseHours(text: string): number | null | 'invalid' {
  if (!text.trim()) return null
  const value = Number(text.replace(',', '.'))
  return Number.isFinite(value) && value >= 0 && value <= 24 ? value : 'invalid'
}

/** Cierre de la sesión: horas de sueño y molestias, cada una en un campo y opcionales. */
export default function FinishSession({
  onFinish,
  onCancel,
}: {
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
      <label>
        Horas de sueño anoche (opcional)
        <input
          inputMode="decimal"
          placeholder="7,5"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
        />
      </label>
      <label>
        Molestias (opcional)
        <input
          placeholder="Ej.: hombro derecho al bajar en el press"
          maxLength={2000}
          value={discomfort}
          onChange={(e) => setDiscomfort(e.target.value)}
        />
        <small className="muted">Solo viajan al análisis del brain si lo activás en Ajustes.</small>
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="finish-actions">
        <button type="button" onClick={onCancel}>
          Seguir entrenando
        </button>
        <button type="submit" className="primary">
          Terminar sesión
        </button>
      </div>
    </form>
  )
}
