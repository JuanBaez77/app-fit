import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { db } from '../db/db'
import { getSyncState, subscribeSync, type SyncState } from './engine'

export interface SyncStatus extends SyncState {
  /** Filas guardadas en el celular que todavía no subieron */
  pending: number
  online: boolean
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

export function useSyncStatus(): SyncStatus {
  const state = useSyncExternalStore(subscribeSync, getSyncState)
  const pending = useLiveQuery(() => db.outbox.count(), [], 0)
  const online = useOnline()
  return { ...state, pending, online }
}
