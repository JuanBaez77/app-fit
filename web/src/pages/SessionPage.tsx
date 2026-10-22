import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router'
import ExerciseCard from '../components/ExerciseCard'
import SetPanel from '../components/SetPanel'
import SyncBadge from '../components/SyncBadge'
import UndoToast from '../components/UndoToast'
import { useExerciseHistory, useExercises, useProfile, useSession } from '../data/hooks'
import { deleteSet, logSet, restoreSet, updateSet, type SetValues } from '../data/sets'
import { db } from '../db/db'
import type { Exercise, RoutineDayExercise, SetLog } from '../db/types'
import { shortDate } from '../lib/dates'
import { lastTime, prefill, routineWeek, targetSets } from '../metrics'

const DEFAULT_WEIGHT_STEP = 2.5

/** Un ejercicio de la sesión: de la rutina, o agregado fuera de rutina (item null). */
interface Entry {
  key: string
  item: RoutineDayExercise | null
  exerciseId: string
}

export default function SessionPage() {
  const { id } = useParams()
  const session = useSession(id)
  // La rutina con la que se hizo la sesión, aunque después haya cambiado de versión
  const routine = useLiveQuery(
    async () =>
      session?.routine_id ? ((await db.routines.get(session.routine_id)) ?? null) : null,
    [session?.routine_id],
  )
  const exercises = useExercises()
  const profile = useProfile()
  const setsToday = useLiveQuery(
    async () =>
      id
        ? (await db.set_logs.where('session_id').equals(id).toArray()).filter((s) => !s.deleted_at)
        : [],
    [id],
  )
  const [chosenKey, setChosenKey] = useState<string | null>(null)
  const [addedExtras, setAddedExtras] = useState<string[]>([])
  const [picking, setPicking] = useState(false)
  const [undo, setUndo] = useState<SetLog | null>(null)
  const closeUndo = useCallback(() => setUndo(null), [])

  if (session === undefined || routine === undefined || !exercises || !setsToday) return null
  if (session === null) {
    return (
      <main className="content">
        <p>No encontré esa sesión.</p>
        <Link to="/">Volver a Hoy</Link>
      </main>
    )
  }

  const day = routine?.days.find((d) => d.id === session.routine_day_id)
  const week = routineWeek(routine?.start_on ?? null, session.date)
  const items = [...(day?.exercises ?? [])].sort((a, b) => a.position - b.position)
  const extraIds = [
    ...new Set([
      ...setsToday.filter((s) => s.routine_day_exercise_id === null).map((s) => s.exercise_id),
      ...addedExtras,
    ]),
  ]
  const entries: Entry[] = [
    ...items.map((item) => ({ key: item.id, item, exerciseId: item.exercise_id })),
    ...extraIds.map((exerciseId) => ({ key: `extra:${exerciseId}`, item: null, exerciseId })),
  ]
  const setsOf = (entry: Entry) =>
    setsToday.filter((s) =>
      entry.item
        ? s.routine_day_exercise_id === entry.item.id
        : s.routine_day_exercise_id === null && s.exercise_id === entry.exerciseId,
    )
  const done = (entry: Entry) =>
    entry.item !== null && setsOf(entry).length >= targetSets(entry.item, week)
  // Sin elección, el primer ejercicio que todavía no completó sus series
  const current =
    entries.find((e) => e.key === chosenKey) ?? entries.find((e) => !done(e)) ?? entries[0]

  function advanceFrom(entry: Entry) {
    const next = entries.find((e) => e.key !== entry.key && !done(e))
    if (next) setChosenKey(next.key)
  }

  const catalog = [...exercises.values()]
    .filter((e) => !e.deleted_at && !entries.some((entry) => entry.exerciseId === e.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))

  return (
    <main className="content session">
      <SyncBadge />
      <header className="page-header">
        <Link to="/" aria-label="Volver a Hoy" className="back">
          ‹
        </Link>
        <h1>
          {day?.name ?? 'Sesión'} · {shortDate(session.date)}
        </h1>
      </header>

      {current && exercises.get(current.exerciseId) && (
        <CurrentExercise
          key={current.key}
          entry={current}
          exercise={exercises.get(current.exerciseId)!}
          sessionId={session.id}
          today={setsOf(current)}
          plannedSets={current.item ? targetSets(current.item, week) : null}
          weightStep={profile?.weight_step_kg ?? DEFAULT_WEIGHT_STEP}
          position={entries.indexOf(current) + 1}
          total={entries.length}
          onCompleted={() => advanceFrom(current)}
          onDeleted={setUndo}
        />
      )}

      <nav className="exercise-nav" aria-label="Ejercicios de la sesión">
        {entries.map((entry) => (
          <button
            key={entry.key}
            type="button"
            aria-current={entry.key === current?.key ? 'true' : undefined}
            onClick={() => setChosenKey(entry.key)}
          >
            {exercises.get(entry.exerciseId)?.name ?? 'Ejercicio'}
            {done(entry) && <span aria-label="completo"> ✓</span>}
          </button>
        ))}
        <button type="button" onClick={() => setPicking((p) => !p)}>
          + ejercicio
        </button>
      </nav>

      {picking && (
        <section className="picker" aria-label="Agregar ejercicio fuera de rutina">
          <p className="muted">Suma al volumen y queda marcado como fuera de rutina.</p>
          {catalog.map((exercise) => (
            <button
              key={exercise.id}
              type="button"
              onClick={() => {
                setAddedExtras((list) => [...list, exercise.id])
                setChosenKey(`extra:${exercise.id}`)
                setPicking(false)
              }}
            >
              {exercise.name}
            </button>
          ))}
        </section>
      )}

      {undo && (
        <UndoToast
          message={`Serie ${undo.set_number} borrada`}
          onUndo={() => void restoreSet(undo)}
          onClose={closeUndo}
        />
      )}
    </main>
  )
}

function CurrentExercise({
  entry,
  exercise,
  sessionId,
  today,
  plannedSets,
  weightStep,
  position,
  total,
  onCompleted,
  onDeleted,
}: {
  entry: Entry
  exercise: Exercise
  sessionId: string
  today: SetLog[]
  plannedSets: number | null
  weightStep: number
  position: number
  total: number
  onCompleted: () => void
  onDeleted: (set: SetLog) => void
}) {
  const history = useExerciseHistory(exercise.id)
  const [editing, setEditing] = useState<SetLog | null>(null)
  if (!history) return null

  const sorted = [...today].sort((a, b) => a.set_number - b.set_number)
  const last = lastTime(history, sessionId)
  const nextNumber = (sorted.at(-1)?.set_number ?? 0) + 1
  // La misma serie de la última vez; si no hay, la última de hoy; si tampoco, el rango de la rutina
  const preset = prefill(nextNumber, last) ??
    (sorted.at(-1) && { weight_kg: sorted.at(-1)!.weight_kg, reps: sorted.at(-1)!.reps }) ?? {
      weight_kg: 0,
      reps: entry.item?.reps_min ?? 8,
    }

  async function saveNew(values: SetValues, interactionMs: number) {
    await logSet({
      sessionId,
      exerciseId: exercise.id,
      routineDayExerciseId: entry.item?.id ?? null,
      setNumber: nextNumber,
      interactionMs,
      ...values,
    })
    // Con la última serie de la rutina, pasa solo al ejercicio siguiente
    if (plannedSets !== null && nextNumber === plannedSets) onCompleted()
  }

  async function saveEdit(set: SetLog, values: SetValues) {
    await updateSet(set, values)
    setEditing(null)
  }

  return (
    <>
      <ExerciseCard
        item={entry.item}
        exercise={exercise}
        plannedSets={plannedSets}
        history={history}
        today={sorted}
        last={last}
        next={editing ? null : { setNumber: nextNumber, ...preset }}
        editingSetId={editing?.id ?? null}
        onSelectSet={setEditing}
        position={position}
        total={total}
      />
      {editing ? (
        <SetPanel
          key={`edit-${editing.id}`}
          title={`Editando serie ${editing.set_number}`}
          initial={editing}
          weightStep={weightStep}
          onSave={(values) => saveEdit(editing, values)}
          onCancel={() => setEditing(null)}
          onDelete={() => {
            void deleteSet(editing).then(onDeleted)
            setEditing(null)
          }}
        />
      ) : (
        <SetPanel
          key={`new-${nextNumber}`}
          title={`Serie ${nextNumber}${plannedSets !== null && nextNumber > plannedSets ? ' (extra)' : ''}`}
          initial={preset}
          weightStep={weightStep}
          onSave={saveNew}
        />
      )}
    </>
  )
}
