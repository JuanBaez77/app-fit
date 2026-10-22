import Dexie, { type EntityTable } from 'dexie'
import type {
  BodyWeight,
  Exercise,
  Muscle,
  OutboxEntry,
  Profile,
  Routine,
  Session,
  SetLog,
} from './types'

export interface ProfileRow extends Profile {
  key: 'me'
}

export interface MetaRow {
  key: 'cursor' | 'userId' | 'lastSyncAt'
  value: string
}

/**
 * La base local (IndexedDB). Todo se escribe acá primero; la sincronización lo sube después.
 * Las tablas se llaman igual que en el push y el pull de la API.
 */
export class AppDB extends Dexie {
  sessions!: EntityTable<Session, 'id'>
  set_logs!: EntityTable<SetLog, 'id'>
  body_weights!: EntityTable<BodyWeight, 'id'>
  exercises!: EntityTable<Exercise, 'id'>
  routines!: EntityTable<Routine, 'id'>
  muscles!: EntityTable<Muscle, 'id'>
  profile!: EntityTable<ProfileRow, 'key'>
  outbox!: EntityTable<OutboxEntry, 'key'>
  meta!: EntityTable<MetaRow, 'key'>

  constructor(name = 'appfit') {
    super(name)
    this.version(1).stores({
      sessions: 'id, date, routine_day_id',
      set_logs: 'id, session_id, [exercise_id+logged_at]',
      body_weights: 'id, date',
      exercises: 'id, name',
      routines: 'id, status, version',
      muscles: 'id',
      profile: 'key',
      outbox: 'key, queuedAt',
      meta: 'key',
    })
  }
}

export const db = new AppDB()

export async function getMeta(key: MetaRow['key']): Promise<string | undefined> {
  return (await db.meta.get(key))?.value
}

/**
 * Si en este dispositivo entra otro usuario, se borra lo local del anterior.
 */
export async function ensureUser(userId: string): Promise<void> {
  const previous = await getMeta('userId')
  if (previous && previous !== userId) {
    await db.transaction('rw', db.tables, async () => {
      await Promise.all(db.tables.map((table) => table.clear()))
    })
  }
  await db.meta.put({ key: 'userId', value: userId })
}
