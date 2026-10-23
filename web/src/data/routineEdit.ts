import { request } from '../api/client'
import { db } from '../db/db'
import type { Routine } from '../db/types'

/** Un ejercicio del día como lo recibe la API. Sin routine_day_exercise_id es uno nuevo. */
export interface ItemPayload {
  routine_day_exercise_id: string | null
  exercise_id: string
  target_sets: number
  reps_min: number
  reps_max: number
  rir_min: number | null
  rir_max: number | null
  rest_min_sec: number | null
  rest_max_sec: number | null
  note: string | null
}

/**
 * Guarda la lista final de un día como una versión nueva de la rutina. Necesita conexión: la
 * API arma la versión. Si respondió, las dos versiones quedan en el celular sin esperar al pull.
 */
export async function saveDay(
  routine: Routine,
  dayId: string,
  exercises: ItemPayload[],
): Promise<Routine> {
  const saved = await request<Routine>(`/routines/${routine.id}/versions`, {
    method: 'POST',
    body: JSON.stringify({ days: [{ routine_day_id: dayId, exercises }] }),
  })
  // En una transacción: nunca hay dos vigentes en el celular
  await db.transaction('rw', db.routines, async () => {
    await db.routines.put({ ...routine, status: 'historica' })
    await db.routines.put(saved)
  })
  return saved
}
