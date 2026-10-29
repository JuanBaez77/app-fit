import { useRef, useState } from 'react'
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

/** Milisegundos desde start; 0 si no hubo un toque antes. */
function msSince(start: number | null): number {
  const now = performance.now()
  return Math.round(now - (start ?? now))
}

interface Props {
  title: string
  initial: { weight_kg: number; reps: number }
  weightStep: number
  /** interactionMs: del primer toque sobre el panel al toque que guarda (la meta es 5 s) */
  onSave: (values: SetValues, interactionMs: number) => Promise<unknown>
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
  const firstTouch = useRef<number | null>(null)

  async function save(rir: number | null) {
    if (saving) return
    setSaving(true)
    const interactionMs = msSince(firstTouch.current)
    try {
      await onSave({ weight_kg: weight, reps, rir }, interactionMs)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      className="set-panel"
      aria-label={title}
      onPointerDownCapture={() => {
        firstTouch.current ??= performance.now()
      }}
    >
      <div className="set-panel-title">
        <strong>{title}</strong>
        {/* Arriba a la derecha, como las acciones de iOS: no ocupa una fila propia */}
        {onCancel ? (
          <button type="button" className="link" onClick={onCancel}>
            Cancelar
          </button>
        ) : (
          <button type="button" className="link" disabled={saving} onClick={() => void save(null)}>
            Guardar sin RIR
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
      <p className="rir-hint">¿Cuántas te quedaban? Tocá y se guarda</p>
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
      {/* Al editar, abajo van guardar sin RIR y borrar */}
      {onCancel && (
        <div className="set-panel-actions">
          <button type="button" className="link" disabled={saving} onClick={() => void save(null)}>
            Guardar sin RIR
          </button>
          {onDelete && (
            <button type="button" className="link danger" onClick={onDelete}>
              Borrar serie
            </button>
          )}
        </div>
      )}
    </section>
  )
}
