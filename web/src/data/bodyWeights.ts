import { db } from '../db/db'
import type { BodyWeight, LocalDate } from '../db/types'
import { newId, saveRow } from '../db/write'

/**
 * Guarda el peso de un día. Si ese día ya tiene uno, lo reemplaza en la misma fila: la API
 * guarda un peso por día, y así no hay dos que resolver al sincronizar.
 */
export async function saveWeight(date: LocalDate, kg: number): Promise<BodyWeight> {
  const existing = (await db.body_weights.where('date').equals(date).toArray()).find(
    (w) => !w.deleted_at,
  )
  return saveRow(
    'body_weights',
    existing ? { ...existing, kg } : { id: newId(), date, kg, deleted_at: null },
  )
}
