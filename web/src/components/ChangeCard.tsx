import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router'
import { ApiError, NetworkError } from '../api/client'
import {
  decideChange,
  type AnalysisChange,
  type ChangeTarget,
  type Decision,
} from '../data/analyses'
import { db } from '../db/db'
import { decimal, range, restText } from '../lib/format'
import { useSyncStatus } from '../sync/useSync'
import BasisLine from './BasisLine'

/** Nombres para leer un target: los ids son de la versión analizada, que está en el celular. */
interface Names {
  /** routine_day_exercise_id -> "Press de banca (Torso)" */
  items: Map<string, { exerciseId: string; day: string }>
  days: Map<string, string>
  exercises: Map<string, string>
  /** routine id -> número de versión */
  versions: Map<string, number>
}

function useNames(): Names | undefined {
  return useLiveQuery(async () => {
    const [routines, exercises] = await Promise.all([db.routines.toArray(), db.exercises.toArray()])
    const names: Names = {
      items: new Map(),
      days: new Map(),
      exercises: new Map(exercises.map((e) => [e.id, e.name])),
      versions: new Map(routines.map((r) => [r.id, r.version])),
    }
    for (const day of routines.flatMap((r) => r.days)) {
      names.days.set(day.id, day.name)
      for (const item of day.exercises) {
        names.items.set(item.id, { exerciseId: item.exercise_id, day: day.name })
      }
    }
    return names
  }, [])
}

const pair = (value: ChangeTarget['from']) =>
  Array.isArray(value)
    ? (range(value[0] ?? null, value[1] ?? null) ?? 'sin definir')
    : 'sin definir'

const rest = (value: ChangeTarget['from']) =>
  Array.isArray(value)
    ? (restText(value[0] ?? null, value[1] ?? null) ?? 'sin definir')
    : 'sin definir'

const single = (value: ChangeTarget['from']) =>
  typeof value === 'number' ? decimal(value) : 'sin definir'

/** Qué cambia, con los nombres de la app: "Press de banca (Torso): 3 → 4 series". */
function describe(change: AnalysisChange, names: Names, muscleName: (id: string) => string) {
  const t = change.target
  const exercise = (id: string | null | undefined) =>
    (id && names.exercises.get(id)) ?? 'un ejercicio'
  const item = () => {
    const found = t.routine_day_exercise_id ? names.items.get(t.routine_day_exercise_id) : undefined
    return found ? `${exercise(found.exerciseId)} (${found.day})` : 'Un ejercicio de la rutina'
  }
  switch (change.type) {
    case 'set_sets':
      return `${item()}: ${single(t.from)} → ${single(t.to)} series`
    case 'set_rep_range':
      return `${item()}: ${pair(t.from)} → ${pair(t.to)} repeticiones`
    case 'set_rir':
      return `${item()}: RIR ${pair(t.from)} → ${pair(t.to)}`
    case 'set_rest':
      return `${item()}: descanso ${rest(t.from)} → ${rest(t.to)}`
    case 'swap_exercise':
      return `${item()} → ${t.new_exercise ? `${t.new_exercise.name} (nuevo)` : exercise(t.to_exercise_id)}`
    case 'add_exercise': {
      const name = t.new_exercise ? `${t.new_exercise.name} (nuevo)` : exercise(t.exercise_id)
      const day = (t.routine_day_id && names.days.get(t.routine_day_id)) ?? 'un día'
      return `Agregar ${name} en ${day}: ${t.sets} × ${pair(t.reps)}`
    }
    case 'remove_exercise':
      return `Quitar ${item()}`
    case 'set_muscle_target':
      return `Meta de ${muscleName(t.muscle_id ?? '')}: ${single(t.from)} → ${single(t.to)} series`
  }
}

/** Un cambio propuesto (US-18): qué cambia, por qué, qué esperar y su base, con Aceptar y Rechazar. */
export default function ChangeCard({
  analysisId,
  change,
  muscleName,
  onDecided,
}: {
  analysisId: string
  change: AnalysisChange
  muscleName: (id: string) => string
  onDecided: (decision: Decision) => void
}) {
  const names = useNames()
  const { online } = useSyncStatus()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Lo que se sabe en el momento de decidir: por qué quedó obsoleto, o la versión que creó
  const [decision, setDecision] = useState<Decision | null>(null)
  const reason = decision?.reason

  async function decide(verb: 'accept' | 'reject') {
    setBusy(true)
    setError(null)
    try {
      const decided = await decideChange(analysisId, change.id, verb)
      setDecision(decided)
      onDecided(decided)
    } catch (err) {
      setError(
        err instanceof NetworkError
          ? 'Sin conexión: aceptar o rechazar necesita internet.'
          : err instanceof ApiError
            ? err.message
            : 'No se pudo guardar la decisión.',
      )
    } finally {
      setBusy(false)
    }
  }

  const applied = change.applied_routine_id
  const version = applied ? (names?.versions.get(applied) ?? decision?.routine?.version) : undefined

  return (
    <li className="card change" aria-label={change.title}>
      <h3>{change.title}</h3>
      {names && <p className="change-what">{describe(change, names, muscleName)}</p>}
      {change.rationale && (
        <p>
          <strong>Por qué:</strong> {change.rationale}
        </p>
      )}
      {change.expectation && (
        <p>
          <strong>Qué esperar:</strong> {change.expectation}
        </p>
      )}
      {change.basis && (
        <BasisLine
          basis={change.basis}
          level={change.evidence_level}
          links={change.evidence_links ?? []}
        />
      )}
      {change.dropped_links && change.dropped_links.length > 0 && (
        <p className="muted">
          Sin respaldo verificable: citó páginas que no están en el brain (
          {change.dropped_links.join(', ')}).
        </p>
      )}

      {change.status === 'pendiente' ? (
        <>
          <div className="change-actions">
            <button type="button" disabled={busy || !online} onClick={() => void decide('reject')}>
              Rechazar
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || !online}
              onClick={() => void decide('accept')}
            >
              Aceptar
            </button>
          </div>
          {!online && <p className="muted">Sin conexión: decidir necesita internet.</p>}
        </>
      ) : (
        <p role="status" className={`change-status change-${change.status}`}>
          {change.status === 'aceptado' &&
            (applied ? (
              <>
                ✓ Aceptado: creó la{' '}
                <Link to={`/rutina/version/${applied}`}>versión {version ?? 'nueva'}</Link>.
              </>
            ) : (
              '✓ Aceptado.'
            ))}
          {change.status === 'rechazado' && 'Rechazado.'}
          {change.status === 'obsoleto' &&
            `Ya no aplica: la rutina cambió desde el análisis.${reason ? ` ${reason}.` : ''}`}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </li>
  )
}
