import { useEffect, type ReactNode } from 'react'
import { closeStaleSessions } from '../data/sessions'
import { ensureUser } from '../db/db'
import { startSync, stopSync } from './engine'

/**
 * Con el usuario adentro: prepara la base local, cierra las sesiones de días anteriores que
 * quedaron abiertas y arranca la sincronización automática.
 */
export default function SyncProvider({
  userId,
  children,
}: {
  userId: string
  children: ReactNode
}) {
  useEffect(() => {
    let cancelled = false
    void ensureUser(userId)
      .then(() => closeStaleSessions())
      .then(() => {
        if (!cancelled) startSync()
      })
    return () => {
      cancelled = true
      stopSync()
    }
  }, [userId])

  return children
}
