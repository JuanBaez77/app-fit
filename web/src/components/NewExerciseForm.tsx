import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { createExercise, type NewExercise } from '../data/exercises'
import { db } from '../db/db'
import type { Exercise } from '../db/types'

/** Cuánto trabaja un músculo: '' no trabaja, 0,5 indirecta, 1 directa. */
type Factor = '' | '0.5' | '1'

/**
 * Ejercicio nuevo para el catálogo (US-03). Pide los músculos y sus factores antes de poder
 * usarlo: sin eso el volumen semanal no se puede contar.
 */
export default function NewExerciseForm({
  existing,
  onCreated,
  onCancel,
}: {
  existing: Exercise[]
  onCreated: (exercise: Exercise) => void
  onCancel: () => void
}) {
  const muscles = useLiveQuery(() => db.muscles.toArray(), [])
  const [name, setName] = useState('')
  const [kind, setKind] = useState<NewExercise['kind']>('aislamiento')
  const [bodyweight, setBodyweight] = useState(false)
  const [factors, setFactors] = useState<Record<string, Factor>>({})
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Poné un nombre.')
      return
    }
    const taken = existing.some(
      (e) => !e.deleted_at && e.name.toLocaleLowerCase('es') === trimmed.toLocaleLowerCase('es'),
    )
    if (taken) {
      setError('Ya hay un ejercicio con ese nombre.')
      return
    }
    const chosen = Object.entries(factors)
      .filter(([, factor]) => factor)
      .map(([muscle_id, factor]) => ({ muscle_id, factor: Number(factor) }))
    if (!chosen.some((m) => m.factor === 1)) {
      setError('Elegí al menos un músculo directo: sin eso no se puede contar el volumen.')
      return
    }
    onCreated(
      await createExercise({ name: trimmed, kind, e1rm_eligible: !bodyweight, muscles: chosen }),
    )
  }

  return (
    <form
      className="card new-exercise"
      aria-label="Ejercicio nuevo"
      onSubmit={(e) => void submit(e)}
    >
      <strong>Ejercicio nuevo</strong>
      <label>
        Nombre
        <input maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Tipo
        <select value={kind} onChange={(e) => setKind(e.target.value as NewExercise['kind'])}>
          <option value="aislamiento">Aislamiento</option>
          <option value="multiarticular">Multiarticular</option>
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={bodyweight}
          onChange={(e) => setBodyweight(e.target.checked)}
        />
        Con peso corporal: se anota el peso agregado y no se estima el 1RM
      </label>
      <fieldset className="factors">
        <legend>Músculos</legend>
        <p className="muted">Directo cuenta 1 serie; indirecto, media.</p>
        {(muscles ?? []).map((m) => (
          <label key={m.id}>
            {m.name}
            <select
              value={factors[m.id] ?? ''}
              onChange={(e) => {
                setFactors({ ...factors, [m.id]: e.target.value as Factor })
                setError(null)
              }}
            >
              <option value="">No trabaja</option>
              <option value="0.5">Indirecto (0,5)</option>
              <option value="1">Directo (1)</option>
            </select>
          </label>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="finish-actions">
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="primary">
          Crear ejercicio
        </button>
      </div>
    </form>
  )
}
