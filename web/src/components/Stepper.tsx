import { useEffect, useRef, useState } from 'react'

const REPEAT_DELAY_MS = 400
const REPEAT_EVERY_MS = 90

/** Al mantener apretado, repite la acción. */
function useRepeat(action: () => void) {
  const timers = useRef<{ delay?: number; every?: number }>({})
  const latest = useRef(action)
  useEffect(() => {
    latest.current = action
  })

  const stop = () => {
    clearTimeout(timers.current.delay)
    clearInterval(timers.current.every)
  }
  useEffect(() => stop, [])

  return {
    onPointerDown: () => {
      stop()
      timers.current.delay = window.setTimeout(() => {
        timers.current.every = window.setInterval(() => latest.current(), REPEAT_EVERY_MS)
      }, REPEAT_DELAY_MS)
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
  }
}

interface Props {
  label: string
  value: number
  step: number
  min: number
  /** Cómo se muestra el número ("82,5") */
  format: (value: number) => string
  unit?: string
  decimals: boolean
  onChange: (value: number) => void
}

function parse(text: string): number | null {
  const value = Number(text.replace(',', '.').trim())
  return Number.isFinite(value) ? value : null
}

/**
 * Fila "PESO [−] 80 kg [+]". Los botones no abren el teclado; tocar el número sí, numérico.
 */
export default function Stepper({
  label,
  value,
  step,
  min,
  format,
  unit,
  decimals,
  onChange,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const change = (delta: number) => onChange(Math.max(min, Math.round((value + delta) * 100) / 100))
  const minus = useRepeat(() => change(-step))
  const plus = useRepeat(() => change(step))

  function commit() {
    const parsed = parse(text)
    if (parsed !== null && parsed >= min) onChange(decimals ? parsed : Math.round(parsed))
    setEditing(false)
  }

  return (
    <div className="stepper">
      <span className="stepper-label">{label}</span>
      <button
        type="button"
        aria-label={`Menos ${label.toLowerCase()}`}
        onClick={() => change(-step)}
        {...minus}
      >
        −
      </button>
      {editing ? (
        <input
          aria-label={label}
          inputMode={decimals ? 'decimal' : 'numeric'}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <button
          type="button"
          className="stepper-value"
          aria-label={`${label}: ${format(value)}${unit ? ` ${unit}` : ''}. Tocá para escribir`}
          onClick={() => {
            setText(format(value))
            setEditing(true)
          }}
        >
          {format(value)}
          {unit && <small> {unit}</small>}
        </button>
      )}
      <button
        type="button"
        aria-label={`Más ${label.toLowerCase()}`}
        onClick={() => change(step)}
        {...plus}
      >
        +
      </button>
    </div>
  )
}
