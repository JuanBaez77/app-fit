// Sincronización con la API: primero sube la cola (push) y después baja lo nuevo (pull).
// Corre al abrir la app, al volver la conexión, cada minuto con la app a la vista y un segundo
// después de cada escritura. Hay una sola corrida a la vez.

import { ApiError, NetworkError, request } from '../api/client'
import { db, getMeta } from '../db/db'
import type {
  BodyWeight,
  Exercise,
  Iso,
  Muscle,
  Profile,
  Routine,
  Session,
  SetLog,
  SyncRows,
  SyncTable,
} from '../db/types'

const PUSH_BATCH = 500
const RETRY_DELAYS_MS = [5_000, 15_000, 60_000, 300_000]
const INTERVAL_MS = 60_000
const DEBOUNCE_MS = 1_000

interface PushOut {
  applied: number
  skipped: number
  rejected: { table: SyncTable; id: string; reason: string }[]
}

interface PullOut {
  cursor: Iso
  sessions: Session[]
  set_logs: SetLog[]
  body_weights: BodyWeight[]
  exercises: Exercise[]
  routines: Routine[]
  profile: Profile | null
  muscles: Muscle[]
}

export interface SyncState {
  syncing: boolean
  lastSyncAt: Iso | null
  /** Último error, o null si la última corrida salió bien */
  error: 'offline' | 'unauthorized' | 'server' | null
}

export type SyncOutcome = 'ok' | NonNullable<SyncState['error']>

let state: SyncState = { syncing: false, lastSyncAt: null, error: null }
const listeners = new Set<() => void>()
let running: Promise<SyncOutcome> | null = null
let failures = 0
let retryTimer: ReturnType<typeof setTimeout> | undefined
let debounceTimer: ReturnType<typeof setTimeout> | undefined
let stopListeners: (() => void) | null = null

function setState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

export function getSyncState(): SyncState {
  return state
}

export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function pushAll(): Promise<void> {
  const entries = await db.outbox.orderBy('queuedAt').toArray()
  for (let start = 0; start < entries.length; start += PUSH_BATCH) {
    const payload: { [T in SyncTable]: SyncRows[T][] } = {
      sessions: [],
      set_logs: [],
      body_weights: [],
      exercises: [],
    }
    // updated_at de cada fila tal como viajó
    const sent = new Map<string, Iso>()
    for (const entry of entries.slice(start, start + PUSH_BATCH)) {
      const row = (await db.table(entry.table).get(entry.rowId)) as SyncRows[SyncTable] | undefined
      if (!row) {
        await db.outbox.delete(entry.key)
        continue
      }
      ;(payload[entry.table] as SyncRows[SyncTable][]).push(row)
      sent.set(entry.key, row.updated_at)
    }
    if (sent.size === 0) continue

    const result = await request<PushOut>('/sync/push', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    for (const rejected of result.rejected) {
      console.warn(`La API rechazó ${rejected.table} ${rejected.id}: ${rejected.reason}`)
    }

    // Sale de la cola solo lo que no cambió mientras viajaba
    await db.transaction('rw', [db.outbox, ...SYNC_TABLES.map((t) => db.table(t))], async () => {
      for (const [key, updatedAt] of sent) {
        const entry = await db.outbox.get(key)
        if (!entry) continue
        const row = (await db.table(entry.table).get(entry.rowId)) as
          { updated_at: Iso } | undefined
        if (!row || row.updated_at === updatedAt) await db.outbox.delete(key)
      }
    })
  }
}

const SYNC_TABLES: SyncTable[] = ['sessions', 'set_logs', 'body_weights', 'exercises']

async function pullChanges(): Promise<void> {
  const cursor = await getMeta('cursor')
  const query = cursor ? `?since=${encodeURIComponent(cursor)}` : ''
  const data = await request<PullOut>(`/sync/pull${query}`)

  await db.transaction('rw', db.tables, async () => {
    // Lo que todavía no subió gana sobre lo que baja
    const pending = new Set((await db.outbox.toArray()).map((entry) => entry.key))
    for (const table of SYNC_TABLES) {
      const rows = (data[table] as SyncRows[SyncTable][]).filter(
        (row) => !pending.has(`${table}:${row.id}`),
      )
      await db.table(table).bulkPut(rows)
    }
    await db.routines.bulkPut(data.routines)
    await db.muscles.bulkPut(data.muscles)
    if (data.profile) await db.profile.put({ key: 'me', ...data.profile })
    await db.meta.put({ key: 'cursor', value: data.cursor })
    await db.meta.put({ key: 'lastSyncAt', value: new Date().toISOString() })
  })
}

async function run(): Promise<SyncOutcome> {
  clearTimeout(retryTimer)
  setState({ syncing: true })
  try {
    await pushAll()
    await pullChanges()
    failures = 0
    setState({ syncing: false, error: null, lastSyncAt: new Date().toISOString() })
    return 'ok'
  } catch (error) {
    const outcome: SyncOutcome =
      error instanceof NetworkError
        ? 'offline'
        : error instanceof ApiError && error.status === 401
          ? 'unauthorized'
          : 'server'
    setState({ syncing: false, error: outcome })
    // Sin sesión espera al próximo login; lo demás se reintenta cada vez más espaciado
    if (outcome !== 'unauthorized') {
      const delay = RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length - 1)]
      failures += 1
      retryTimer = setTimeout(() => void syncNow(), delay)
    }
    return outcome
  }
}

/** Sincroniza ya. Si hay una corrida en curso, devuelve esa. */
export function syncNow(): Promise<SyncOutcome> {
  running ??= run().finally(() => {
    running = null
  })
  return running
}

/** Pide una sincronización en un segundo; varias escrituras seguidas viajan juntas. */
export function requestSync(): void {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => void syncNow(), DEBOUNCE_MS)
}

/** Arranca la sincronización automática. Devuelve la función que la detiene. */
export function startSync(): () => void {
  stopSync()
  // Pide que el navegador no borre IndexedDB por falta de uso (riesgo en iOS)
  void navigator.storage?.persist?.()

  const onOnline = () => void syncNow()
  const onVisible = () => {
    if (document.visibilityState === 'visible') void syncNow()
  }
  const interval = setInterval(onVisible, INTERVAL_MS)
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisible)
  stopListeners = () => {
    clearInterval(interval)
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisible)
  }
  void syncNow()
  return stopSync
}

export function stopSync(): void {
  stopListeners?.()
  stopListeners = null
  clearTimeout(retryTimer)
  clearTimeout(debounceTimer)
  failures = 0
}

/** Solo para tests: vuelve el estado al inicial. */
export function resetSyncForTests(): void {
  stopSync()
  running = null
  state = { syncing: false, lastSyncAt: null, error: null }
}
