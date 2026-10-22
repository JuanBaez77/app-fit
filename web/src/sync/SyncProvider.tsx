import { useEffect, type ReactNode } from 'react'
import { ensureUser } from '../db/db'
import { startSync, stopSync } from './engine'

/** Con el usuario adentro: prepara la base local y arranca la sincronización automática. */
export default function SyncProvider({
  userId,
  children,
}: {
  userId: string
  children: ReactNode
}) {
  useEffect(() => {
    let cancelled = false
    void ensureUser(userId).then(() => {
      if (!cancelled) startSync()
    })
    return () => {
      cancelled = true
      stopSync()
    }
  }, [userId])

  return children
}
