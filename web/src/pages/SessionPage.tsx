import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import ExerciseCard from '../components/ExerciseCard'
import FinishSession from '../components/FinishSession'
import Icon from '../components/Icon'
import SetPanel from '../components/SetPanel'
import Sheet from '../components/Sheet'
import SyncBadge from '../components/SyncBadge'
import UndoToast from '../components/UndoToast'
import { useExerciseHistory, useExercises, useProfile, useSession } from '../data/hooks'
import { finishSession } from '../data/sessions'
import { deleteSet, logSet, restoreSet, updateSet, type SetValues } from '../data/sets'
import { db } from '../db/db'
import type { Exercise, RoutineDayExercise, SetLog } from '../db/types'
import { shortDate } from '../lib/dates'
import { useSwipe } from '../lib/swipe'
import { lastTime, prefill, routineWeek, targetSets } from '../metrics'

const DEFAULT_WEIGHT_STEP = 2.5

/** Un ejercicio de la sesión: de la rutina, o agregado fuera de rutina (item null). */
interface Entry {
  key: string
  item: RoutineDayExercise | null
  exerciseId: string
}

type SheetName = 'exercises' | 'catalog' | 'finish'

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

/** Para buscar sin importar mayúsculas ni tildes: "jalon" encuentra "Jalón". */
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** "52 min", "1 h 5 min" */
function elapsed(minutes: number): string {
  const h = Math.floor(minutes / 60)
  return h ? `${h} h ${minutes % 60} min` : `${minutes} min`
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
  // De qué lado entra el ejercicio nuevo, para la animación
  const [direction, setDirection] = useState<'next' | 'prev' | null>(null)
  const [addedExtras, setAddedExtras] = useState<string[]>([])
  const [sheet, setSheet] = useState<SheetName | null>(null)
  const [search, setSearch] = useState('')
  const [undo, setUndo] = useState<SetLog | null>(null)
  // Cuándo se abrió Terminar: para la duración del resumen
  const [finishAt, setFinishAt] = useState(0)
  const navigate = useNavigate()
  const closeUndo = useCallback(() => setUndo(null), [])
  const closeSheet = useCallback(() => {
    setSheet(null)
    setSearch('')
  }, [])

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
  const planned = (entry: Entry) => (entry.item ? targetSets(entry.item, week) : null)
  const done = (entry: Entry) => entry.item !== null && setsOf(entry).length >= planned(entry)!
  // Sin elección, el primer ejercicio que todavía no completó sus series
  const current =
    entries.find((e) => e.key === chosenKey) ?? entries.find((e) => !done(e)) ?? entries[0]
  const index = current ? entries.indexOf(current) : -1
  // El avance de la sesión: las series de la rutina, sin contar las extra
  const plannedTotal = items.reduce((sum, item) => sum + targetSets(item, week), 0)
  const doneTotal = entries.reduce(
    (sum, e) => sum + (e.item ? Math.min(setsOf(e).length, planned(e)!) : 0),
    0,
  )
  const name = (exerciseId: string) => exercises.get(exerciseId)?.name ?? 'Ejercicio'

  function choose(key: string, to: 'next' | 'prev') {
    if (key === current?.key) return
    setDirection(to)
    setChosenKey(key)
  }

  function go(delta: number) {
    const target = entries[index + delta]
    if (target) choose(target.key, delta > 0 ? 'next' : 'prev')
  }

  function advanceFrom(entry: Entry) {
    const next = entries.find((e) => e.key !== entry.key && !done(e))
    if (next) choose(next.key, 'next')
  }

  const catalog = [...exercises.values()]
    .filter((e) => !e.deleted_at && !entries.some((entry) => entry.exerciseId === e.id))
    .filter((e) => normalize(e.name).includes(normalize(search.trim())))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))

  const minutes = session.started_at
    ? Math.round((finishAt - Date.parse(session.started_at)) / 60_000)
    : null
  const summary = [
    plural(entries.filter((e) => setsOf(e).length > 0).length, 'ejercicio', 'ejercicios'),
    plural(setsToday.length, 'serie', 'series'),
    // La duración solo si es la de una sesión en curso, no la de una vieja
    ...(minutes !== null && minutes > 0 && minutes < 6 * 60 ? [elapsed(minutes)] : []),
  ].join(' · ')

  return (
    <main className="content session">
      <SyncBadge />
      <header className="session-bar">
        <Link to="/" className="back-link">
          <Icon name="chevronLeft" size={22} />
          Hoy
        </Link>
        <div className="session-bar-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="Ejercicios"
            onClick={() => setSheet('exercises')}
          >
            <span>
              <Icon name="list" />
            </span>
          </button>
          {!session.ended_at && (
            <button
              type="button"
              className="link session-finish"
              onClick={() => {
                setFinishAt(Date.now())
                setSheet('finish')
              }}
            >
              Terminar
            </button>
          )}
        </div>
      </header>

      <div className="session-title">
        <h1>{day?.name ?? 'Sesión'}</h1>
        <p className="muted subhead">
          {shortDate(session.date)}
          {plannedTotal > 0 && ` · ${doneTotal} de ${plannedTotal} series`}
          {session.ended_at && <span className="badge">Cerrada</span>}
        </p>
        {plannedTotal > 0 && (
          <div
            className="progress"
            role="progressbar"
            aria-label="Series de la rutina"
            aria-valuemin={0}
            aria-valuemax={plannedTotal}
            aria-valuenow={doneTotal}
          >
            <span style={{ width: `${(doneTotal / plannedTotal) * 100}%` }} />
          </div>
        )}
        {session.ended_at && (
          <p className="footnote muted">Sesión cerrada. Podés corregir las series.</p>
        )}
      </div>

      {current && exercises.get(current.exerciseId) && (
        <CurrentExercise
          key={current.key}
          entry={current}
          exercise={exercises.get(current.exerciseId)!}
          sessionId={session.id}
          today={setsOf(current)}
          plannedSets={planned(current)}
          weightStep={profile?.weight_step_kg ?? DEFAULT_WEIGHT_STEP}
          position={index + 1}
          total={entries.length}
          onSwipe={go}
          direction={direction}
          onCompleted={() => advanceFrom(current)}
          onDeleted={setUndo}
          notice={
            undo && (
              <UndoToast
                message={`Serie ${undo.set_number} borrada`}
                onUndo={() => void restoreSet(undo)}
                onClose={closeUndo}
              />
            )
          }
        />
      )}

      {sheet === 'exercises' && (
        <Sheet
          title="Ejercicios"
          onClose={closeSheet}
          action={
            <button type="button" className="link" onClick={closeSheet}>
              Listo
            </button>
          }
        >
          <ul className="grouped" aria-label="Ejercicios de la sesión">
            {entries.map((entry, i) => {
              const goal = planned(entry)
              const count = setsOf(entry).length
              return (
                <li key={entry.key}>
                  <button
                    type="button"
                    className="grouped-row exercise-row"
                    aria-current={entry.key === current?.key ? 'true' : undefined}
                    onClick={() => {
                      choose(entry.key, i > index ? 'next' : 'prev')
                      closeSheet()
                    }}
                  >
                    <span className="grouped-row-text">
                      <span>{name(entry.exerciseId)}</span>
                      {!entry.item && <span className="muted subhead">Fuera de rutina</span>}
                    </span>
                    <span className="muted">
                      {goal === null ? plural(count, 'serie', 'series') : `${count} de ${goal}`}
                    </span>
                    <span className="done-check">
                      {done(entry) && (
                        <>
                          <Icon name="check" size={18} />
                          <span className="sr-only">, completo</span>
                        </>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <ul className="grouped sheet-group">
            <li>
              <button
                type="button"
                className="grouped-row add-row"
                onClick={() => setSheet('catalog')}
              >
                <Icon name="plus" size={20} />
                <span className="grouped-row-text">Agregar ejercicio</span>
              </button>
            </li>
          </ul>
          <p className="list-footer footnote muted">
            Lo que agregues suma al volumen y queda marcado como fuera de rutina.
          </p>
        </Sheet>
      )}

      {sheet === 'catalog' && (
        <Sheet
          title="Agregar ejercicio"
          onClose={closeSheet}
          action={
            <button type="button" className="link" onClick={closeSheet}>
              Cancelar
            </button>
          }
        >
          <input
            type="search"
            className="search-field"
            placeholder="Buscar"
            aria-label="Buscar ejercicio"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {catalog.length === 0 ? (
            <p className="grouped-empty">No hay ejercicios con ese nombre.</p>
          ) : (
            <ul className="grouped" aria-label="Catálogo">
              {catalog.map((exercise) => (
                <li key={exercise.id}>
                  <button
                    type="button"
                    className="grouped-row"
                    onClick={() => {
                      setAddedExtras((list) => [...list, exercise.id])
                      setDirection('next')
                      setChosenKey(`extra:${exercise.id}`)
                      closeSheet()
                    }}
                  >
                    {exercise.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      )}

      {sheet === 'finish' && (
        <Sheet title="Terminar la sesión" onClose={closeSheet}>
          <FinishSession
            summary={summary}
            onCancel={closeSheet}
            onFinish={async (close) => {
              await finishSession(session, close)
              navigate('/')
            }}
          />
        </Sheet>
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
  onSwipe,
  direction,
  onCompleted,
  onDeleted,
  notice,
}: {
  entry: Entry
  exercise: Exercise
  sessionId: string
  today: SetLog[]
  plannedSets: number | null
  weightStep: number
  position: number
  total: number
  /** Deslizar de costado sobre el ejercicio: 1 al siguiente, -1 al anterior */
  onSwipe: (delta: 1 | -1) => void
  direction: 'next' | 'prev' | null
  onCompleted: () => void
  onDeleted: (set: SetLog) => void
  /** El aviso de deshacer: va arriba del panel, para no tapar sus botones */
  notice: ReactNode
}) {
  const history = useExerciseHistory(exercise.id)
  const [editing, setEditing] = useState<SetLog | null>(null)
  // La serie recién guardada entra con una animación corta: es la confirmación
  const [justSaved, setJustSaved] = useState<string | null>(null)
  const swipe = useSwipe(onSwipe)
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
  const title =
    plannedSets === null
      ? `Serie ${nextNumber}`
      : nextNumber > plannedSets
        ? `Serie ${nextNumber} · extra`
        : `Serie ${nextNumber} de ${plannedSets}`

  async function saveNew(values: SetValues, interactionMs: number) {
    const saved = await logSet({
      sessionId,
      exerciseId: exercise.id,
      routineDayExerciseId: entry.item?.id ?? null,
      setNumber: nextNumber,
      interactionMs,
      ...values,
    })
    setJustSaved(saved.id)
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
        justSavedId={justSaved}
        onSelectSet={setEditing}
        position={position}
        total={total}
        swipe={swipe}
        direction={direction}
      />
      <div className="session-dock">
        {notice}
        {editing ? (
          <SetPanel
            key={`edit-${editing.id}`}
            title={`Editar serie ${editing.set_number}`}
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
            title={title}
            initial={preset}
            weightStep={weightStep}
            onSave={saveNew}
          />
        )}
      </div>
    </>
  )
}
