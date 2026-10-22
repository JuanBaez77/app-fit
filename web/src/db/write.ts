import { v7 as uuidv7 } from 'uuid'
import { requestSync } from '../sync/engine'
import { db } from './db'
import type { Iso, SyncRows, SyncTable } from './types'

/** Ids generados en el celular: así se puede crear filas sin red. UUID v7 se ordena por tiempo. */
export const newId = (): string => uuidv7()

export const nowIso = (): Iso => new Date().toISOString()

/**
 * Guarda una fila en el celular y la deja en la cola para subirla. Las dos escrituras van en una
 * sola transacción: cuando la promesa resuelve, la fila ya está en disco, y recién ahí se muestra
 * la confirmación.
 */
export async function saveRow<T extends SyncTable>(
  table: T,
  row: Omit<SyncRows[T], 'updated_at'>,
): Promise<SyncRows[T]> {
  const saved = { ...row, updated_at: nowIso() } as SyncRows[T]
  await db.transaction('rw', db.table(table), db.outbox, async () => {
    await db.table(table).put(saved)
    await db.outbox.put({
      key: `${table}:${saved.id}`,
      table,
      rowId: saved.id,
      queuedAt: saved.updated_at,
    })
  })
  requestSync()
  return saved
}

/** Borrado lógico: la fila queda marcada y el borrado viaja como cualquier cambio. */
export function softDelete<T extends SyncTable>(table: T, row: SyncRows[T]): Promise<SyncRows[T]> {
  return saveRow(table, { ...row, deleted_at: nowIso() })
}
