import { useState } from 'react'
import type { SetValues } from '../data/sets'
import { kg } from '../lib/format'
import Stepper from './Stepper'

/** 3+ se guarda como 3: "me quedaban 3 o más". */
const RIR_CHIPS = [
  { label: '0', value: 0 },
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3+', value: 3 },
]

interface Props {
  title: string
  initial: { weight_kg: number; reps: number }
  weightStep: number
  onSave: (values: SetValues) => Promise<unknown>
  onDelete?: () => void
  onCancel?: () => void
}

/**
 * Panel de registro, en la mitad inferior de la pantalla, donde llega el pulgar. Tocar una ficha
 * de RIR guarda la serie: sin cambios es 1 toque; con un ajuste, 2.
 */
export default function SetPanel({
  title,
  initial,
  weightStep,
  onSave,
  onDelete,
  onCancel,
}: Props) {
  const [weight, setWeight] = useState(initial.weight_kg)
  const [reps, setReps] = useState(initial.reps)
  const [saving, setSaving] = useState(false)

  async function save(rir: number | null) {
    if (saving) return
    setSaving(true)
    try {
      await onSave({ weight_kg: weight, reps, rir })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="set-panel" aria-label={title}>
      <div className="set-panel-title">
        <strong>{title}</strong>
        {onCancel && (
          <button type="button" className="link" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
      <Stepper
        label="Peso"
        value={weight}
        step={weightStep}
        min={0}
        format={kg}
        unit="kg"
        decimals
        onChange={setWeight}
      />
      <Stepper
        label="Reps"
        value={reps}
        step={1}
        min={1}
        format={String}
        decimals={false}
        onChange={setReps}
      />
      <p className="rir-hint">¿Cuántas te quedaban? Tocá = guarda</p>
      <div className="rir-chips" role="group" aria-label="RIR">
        {RIR_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            className="rir-chip"
            aria-label={`RIR ${chip.label}: guardar`}
            disabled={saving}
            onClick={() => void save(chip.value)}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <div className="set-panel-actions">
        <button type="button" disabled={saving} onClick={() => void save(null)}>
          Guardar sin RIR
        </button>
        {onDelete && (
          <button type="button" className="danger" onClick={onDelete}>
            Borrar serie
          </button>
        )}
      </div>
    </section>
  )
}
