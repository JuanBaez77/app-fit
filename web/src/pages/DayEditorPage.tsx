import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError, NetworkError } from '../api/client'
import NewExerciseForm from '../components/NewExerciseForm'
import { useCurrentRoutine, useExercises } from '../data/hooks'
import { saveDay, type ItemPayload } from '../data/routineEdit'
import type { Exercise, Routine, RoutineDay, RoutineDayExercise } from '../db/types'
import { decimal } from '../lib/format'

/** Un ejercicio del día mientras se edita: los números como texto, como se escriben. */
interface DraftItem {
  /** Clave estable para React (el id de la fila, o uno local si es nuevo) */
  key: string
  routine_day_exercise_id: string | null
  exercise_id: string
  sets: string
  reps_min: string
  reps_max: string
  rir_min: string
  rir_max: string
  /** Descanso en minutos */
  rest_min: string
  rest_max: string
  note: string
}

/** Lo que se escribe en los campos */
type TextField = Exclude<keyof DraftItem, 'key' | 'routine_day_exercise_id' | 'exercise_id'>

const text = (value: number | null) => (value === null ? '' : String(value))
const minutes = (seconds: number | null) => (seconds === null ? '' : decimal(seconds / 60))

function toDraft(item: RoutineDayExercise): DraftItem {
  return {
    key: item.id,
    routine_day_exercise_id: item.id,
    exercise_id: item.exercise_id,
    sets: text(item.target_sets),
    reps_min: text(item.reps_min),
    reps_max: text(item.reps_max),
    rir_min: text(item.rir_min),
    rir_max: text(item.rir_max),
    rest_min: minutes(item.rest_min_sec),
    rest_max: minutes(item.rest_max_sec),
    note: item.note ?? '',
  }
}

let localKeys = 0

function newDraft(exerciseId: string): DraftItem {
  localKeys += 1
  return {
    key: `nuevo-${localKeys}`,
    routine_day_exercise_id: null,
    exercise_id: exerciseId,
    sets: '3',
    reps_min: '8',
    reps_max: '12',
    rir_min: '1',
    rir_max: '2',
    rest_min: '2',
    rest_max: '3',
    note: '',
  }
}

/** Vacío es null; lo que no es un número, NaN (no pasa ningún control de rango). */
function parse(value: string): number | null {
  return value.trim() ? Number(value.replace(',', '.').trim()) : null
}

/** Un rango opcional: los dos vacíos (null) o los dos completos, dentro de [floor, ceil]. */
function parseRange(
  low: string,
  high: string,
  floor: number,
  ceil: number,
  integer: boolean,
): [number, number] | null | 'invalid' {
  const lo = parse(low)
  const hi = parse(high)
  if (lo === null && hi === null) return null
  if (lo === null || hi === null) return 'invalid'
  const ok = (n: number) => n >= floor && n <= ceil && (!integer || Number.isInteger(n))
  return ok(lo) && ok(hi) && hi >= lo ? [lo, hi] : 'invalid'
}

/** Convierte el borrador; si algo está mal, devuelve el mensaje para mostrar. */
function toPayload(item: DraftItem, name: string): ItemPayload | string {
  const sets = parse(item.sets)
  if (sets === null || !Number.isInteger(sets) || sets < 1 || sets > 20) {
    return `${name}: las series van de 1 a 20.`
  }
  const reps = parseRange(item.reps_min, item.reps_max, 1, 100, true)
  if (reps === null || reps === 'invalid') {
    return `${name}: las repeticiones van de 1 a 100, y el máximo no puede ser menor.`
  }
  const rir = parseRange(item.rir_min, item.rir_max, 0, 5, true)
  if (rir === 'invalid') {
    return `${name}: el RIR va de 0 a 5, completo o vacío, y el máximo no puede ser menor.`
  }
  const rest = parseRange(item.rest_min, item.rest_max, 0, 15, false)
  if (rest === 'invalid') {
    return `${name}: el descanso va de 0 a 15 min, completo o vacío, y el máximo no puede ser menor.`
  }

  return {
    routine_day_exercise_id: item.routine_day_exercise_id,
    exercise_id: item.exercise_id,
    target_sets: sets,
    reps_min: reps[0],
    reps_max: reps[1],
    rir_min: rir?.[0] ?? null,
    rir_max: rir?.[1] ?? null,
    rest_min_sec: rest ? Math.round(rest[0] * 60) : null,
    rest_max_sec: rest ? Math.round(rest[1] * 60) : null,
    note: item.note.trim() || null,
  }
}

/** Editor de un día: agregar, quitar, reordenar y cambiar la prescripción (US-02). */
export default function DayEditorPage() {
  const { dayId } = useParams()
  const routine = useCurrentRoutine()
  const exercises = useExercises()

  if (routine === undefined || !exercises) return null
  const day = routine?.days.find((d) => d.id === dayId)

  return (
    <main>
      <header className="page-header">
        <h1>{day ? `Editar ${day.name}` : 'Editar'}</h1>
        <Link to="/rutina" className="link">
          Cancelar
        </Link>
      </header>
      {!routine || !day ? (
        <p className="muted">
          Ese día no es de la versión vigente. <Link to="/rutina">Volver a la rutina</Link>
        </p>
      ) : (
        <DayEditor key={routine.id} routine={routine} day={day} exercises={exercises} />
      )}
    </main>
  )
}

function DayEditor({
  routine,
  day,
  exercises,
}: {
  routine: Routine
  day: RoutineDay
  exercises: Map<string, Exercise>
}) {
  const navigate = useNavigate()
  const [items, setItems] = useState(() => day.exercises.map(toDraft))
  const [dirty, setDirty] = useState(false)
  const [adding, setAdding] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const name = (id: string) => exercises.get(id)?.name ?? 'Ejercicio'
  // Solo los que tienen un músculo directo: sin eso no se puede contar el volumen (US-03)
  const catalog = [...exercises.values()]
    .filter((e) => !e.deleted_at && e.muscles.some((m) => m.factor === 1))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))

  function update(next: DraftItem[]) {
    setItems(next)
    setDirty(true)
    setError(null)
  }

  function change(key: string, field: TextField, value: string) {
    update(items.map((item) => (item.key === key ? { ...item, [field]: value } : item)))
  }

  function move(index: number, delta: number) {
    const next = [...items]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item!)
    update(next)
  }

  async function save() {
    const payload: ItemPayload[] = []
    for (const item of items) {
      const result = toPayload(item, name(item.exercise_id))
      if (typeof result === 'string') {
        setError(result)
        return
      }
      payload.push(result)
    }
    setSaving(true)
    try {
      const saved = await saveDay(routine, day.id, payload)
      navigate('/rutina', { state: { savedVersion: saved.version } })
    } catch (err) {
      setError(
        err instanceof NetworkError
          ? 'Sin conexión: la rutina se edita con red.'
          : err instanceof ApiError
            ? err.message
            : 'No se pudo guardar.',
      )
      setSaving(false)
    }
  }

  return (
    <>
      <p className="muted">
        Guardar crea la versión {routine.version + 1}; la actual queda en el historial.
      </p>
      <ol className="editor-items">
        {items.map((item, index) => {
          const label = name(item.exercise_id)
          const field = (
            key: TextField,
            title: string,
            mode: 'numeric' | 'decimal' = 'numeric',
          ) => (
            <label>
              {title}
              <input
                inputMode={mode}
                aria-label={`${title} de ${label}`}
                value={item[key]}
                onChange={(e) => change(item.key, key, e.target.value)}
              />
            </label>
          )
          return (
            <li key={item.key} className="card editor-item" aria-label={label}>
              <div className="editor-item-header">
                <strong>{label}</strong>
                <div className="editor-item-actions">
                  <button
                    type="button"
                    aria-label={`Subir ${label}`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Bajar ${label}`}
                    disabled={index === items.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Quitar ${label}`}
                    disabled={items.length === 1}
                    onClick={() => update(items.filter((i) => i.key !== item.key))}
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="editor-fields">
                {field('sets', 'Series')}
                {field('reps_min', 'Reps mín.')}
                {field('reps_max', 'Reps máx.')}
                {field('rir_min', 'RIR mín.')}
                {field('rir_max', 'RIR máx.')}
                {field('rest_min', 'Desc. mín. (min)', 'decimal')}
                {field('rest_max', 'Desc. máx. (min)', 'decimal')}
              </div>
              <label>
                Nota
                <input
                  aria-label={`Nota de ${label}`}
                  maxLength={500}
                  value={item.note}
                  onChange={(e) => change(item.key, 'note', e.target.value)}
                />
              </label>
            </li>
          )
        })}
      </ol>

      <div className="editor-add">
        <label>
          Agregar ejercicio
          <select value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">Elegí un ejercicio…</option>
            {catalog.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!adding}
          onClick={() => {
            update([...items, newDraft(adding)])
            setAdding('')
          }}
        >
          Agregar
        </button>
      </div>
      {creating ? (
        <NewExerciseForm
          existing={[...exercises.values()]}
          onCreated={(exercise) => {
            update([...items, newDraft(exercise.id)])
            setCreating(false)
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button type="button" className="link" onClick={() => setCreating(true)}>
          ¿No está? Crear un ejercicio nuevo
        </button>
      )}

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        type="button"
        className="primary big"
        disabled={!dirty || saving}
        onClick={() => void save()}
      >
        {saving ? 'Guardando…' : `Guardar versión ${routine.version + 1}`}
      </button>
    </>
  )
}
