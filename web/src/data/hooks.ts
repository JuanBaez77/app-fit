// Lecturas reactivas de la base local: la pantalla se actualiza sola cuando cambian los datos.

import Dexie from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Exercise, LocalDate, Profile, Routine, Session } from '../db/types'
import { groupBySession, type SessionSets } from '../metrics'

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

/** Series de un ejercicio agrupadas por sesión, de la más vieja a la más nueva. */
export function useExerciseHistory(exerciseId: string | undefined): SessionSets[] | undefined {
  return useLiveQuery(async () => {
    if (!exerciseId) return []
    const sets = await db.set_logs
      .where('[exercise_id+logged_at]')
      .between([exerciseId, Dexie.minKey], [exerciseId, Dexie.maxKey])
      .toArray()
    const ids = [...new Set(sets.map((s) => s.session_id))]
    const sessions = (await db.sessions.bulkGet(ids)).filter((s) => s !== undefined)
    return groupBySession(sets, new Map(sessions.map((s) => [s.id, s])))
  }, [exerciseId])
}
