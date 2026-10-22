// Lecturas reactivas de la base local: la pantalla se actualiza sola cuando cambian los datos.

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Exercise, LocalDate, Profile, Routine, Session } from '../db/types'

/** undefined mientras carga; null si no hay rutina vigente. */
export function useCurrentRoutine(): Routine | null | undefined {
  return useLiveQuery(
    async () => (await db.routines.where('status').equals('vigente').first()) ?? null,
    [],
  )
}

export function useExercises(): Map<string, Exercise> | undefined {
  return useLiveQuery(async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e])), [])
}

export function useProfile(): Profile | null | undefined {
  return useLiveQuery(async () => (await db.profile.get('me')) ?? null, [])
}

/** Sesiones no borradas de un día, la más reciente primero. */
export function useSessionsOn(date: LocalDate): Session[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.sessions.where('date').equals(date).toArray())
        .filter((s) => !s.deleted_at)
        .sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? '')),
    [date],
  )
}

export function useSession(id: string | undefined): Session | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.sessions.get(id)) ?? null) : null), [id])
}

/** True si el celular ya sincronizó alguna vez. */
export function useHasSynced(): boolean | undefined {
  return useLiveQuery(async () => Boolean(await db.meta.get('cursor')), [])
}
