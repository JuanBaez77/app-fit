import type { Routine, RoutineDay, RoutineDayExercise } from '../db/types'
import { decimal, prescription, range, restText } from '../lib/format'

interface Names {
  exercise: (id: string) => string
  muscle: (id: string) => string
}

const pair = (min: number | null, max: number | null) => range(min, max) ?? 'sin definir'
const rest = (item: RoutineDayExercise) =>
  restText(item.rest_min_sec, item.rest_max_sec) ?? 'sin definir'

/** Lo que cambió en un ejercicio que siguió en el día. */
function itemChanges(before: RoutineDayExercise, after: RoutineDayExercise): string[] {
  const changes: string[] = []
  if (before.target_sets !== after.target_sets) {
    changes.push(`${before.target_sets} → ${after.target_sets} series`)
  }
  if (before.reps_min !== after.reps_min || before.reps_max !== after.reps_max) {
    changes.push(
      `${pair(before.reps_min, before.reps_max)} → ${pair(after.reps_min, after.reps_max)} repeticiones`,
    )
  }
  if (before.rir_min !== after.rir_min || before.rir_max !== after.rir_max) {
    changes.push(
      `RIR ${pair(before.rir_min, before.rir_max)} → ${pair(after.rir_min, after.rir_max)}`,
    )
  }
  if (before.rest_min_sec !== after.rest_min_sec || before.rest_max_sec !== after.rest_max_sec) {
    changes.push(`descanso ${rest(before)} → ${rest(after)}`)
  }
  return changes
}

/** El día de la versión anterior que corresponde: el editor y el brain no renombran días. */
function matchDay(before: Routine, day: RoutineDay): RoutineDay | undefined {
  return before.days.find((d) => d.name === day.name)
}

function dayChanges(before: RoutineDay, after: RoutineDay, names: Names): string[] {
  const lines: string[] = []
  const name = (item: RoutineDayExercise) => names.exercise(item.exercise_id)
  const kept = new Set(before.exercises.map((i) => i.exercise_id))
  const now = new Set(after.exercises.map((i) => i.exercise_id))
  const removed = before.exercises.filter((i) => !now.has(i.exercise_id))
  const added = after.exercises.filter((i) => !kept.has(i.exercise_id))

  for (const item of added) {
    // Uno que sale y otro que entra en el mismo lugar es un reemplazo
    const replaced = removed.findIndex((r) => r.position === item.position)
    if (replaced >= 0) {
      const [old] = removed.splice(replaced, 1)
      lines.push(`${after.name}: ${name(old!)} → ${name(item)}`)
    } else {
      lines.push(`${after.name}: se agregó ${name(item)} (${prescription(item, item.target_sets)})`)
    }
  }
  for (const item of removed) lines.push(`${after.name}: se quitó ${name(item)}`)

  const previous = new Map(before.exercises.map((i) => [i.exercise_id, i]))
  for (const item of after.exercises) {
    const old = previous.get(item.exercise_id)
    const changes = old ? itemChanges(old, item) : []
    if (changes.length) lines.push(`${after.name} · ${name(item)}: ${changes.join(', ')}`)
  }

  const order = (day: RoutineDay, other: Set<string>) =>
    day.exercises.filter((i) => other.has(i.exercise_id)).map((i) => i.exercise_id)
  if (order(before, now).join() !== order(after, kept).join()) {
    lines.push(`${after.name}: cambió el orden`)
  }
  return lines
}

/**
 * Qué cambió de una versión a la siguiente, en palabras (US-19). Compara por día y por
 * ejercicio: las versiones se guardan enteras, y en el celular no viaja el linaje.
 */
export function diffVersions(before: Routine, after: Routine, names: Names): string[] {
  const lines: string[] = []
  for (const day of after.days) {
    const old = matchDay(before, day)
    if (old) lines.push(...dayChanges(old, day, names))
    else lines.push(`Día nuevo: ${day.name}`)
  }
  for (const day of before.days) {
    if (!after.days.some((d) => d.name === day.name)) lines.push(`Se quitó el día ${day.name}`)
  }

  const targets = new Map(before.muscle_targets.map((t) => [t.muscle_id, t]))
  for (const target of after.muscle_targets) {
    const old = targets.get(target.muscle_id)
    const muscle = names.muscle(target.muscle_id)
    if (!old) {
      lines.push(`Meta nueva de ${muscle}: ${decimal(target.target_sets)} series`)
    } else if (old.target_sets !== target.target_sets) {
      lines.push(
        `Meta de ${muscle}: ${decimal(old.target_sets)} → ${decimal(target.target_sets)} series`,
      )
    } else if (old.range_min !== target.range_min || old.range_max !== target.range_max) {
      lines.push(
        `Rango de ${muscle}: ${pair(old.range_min, old.range_max)} → ${pair(target.range_min, target.range_max)}`,
      )
    }
  }
  return lines
}
