import { db } from '../db/db'
import type { Exercise, ExerciseMuscle } from '../db/types'
import { newId, saveRow } from '../db/write'

export interface NewExercise {
  name: string
  kind: NonNullable<Exercise['kind']>
  e1rm_eligible: boolean
  muscles: ExerciseMuscle[]
}

/** Crea un ejercicio en el celular; sube con la próxima sincronización, como las series. */
export function createExercise(exercise: NewExercise): Promise<Exercise> {
  return saveRow('exercises', { id: newId(), brain_page: null, deleted_at: null, ...exercise })
}

/** Los de la lista que todavía no subieron a la API. */
export async function pendingExercises(ids: string[]): Promise<string[]> {
  const queued = await db.outbox.bulkGet(ids.map((id) => `exercises:${id}`))
  return ids.filter((_, i) => queued[i] !== undefined)
}
