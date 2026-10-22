import { expect, test } from 'vitest'
import { db } from '../db/db'
import type { Session } from '../db/types'
import { stopSync } from '../sync/engine'
import { closeStaleSessions } from './sessions'

function session(id: string, date: string, extra: Partial<Session> = {}): Session {
  return {
    id,
    routine_id: null,
    routine_day_id: null,
    date,
    started_at: `${date}T20:00:00.000Z`,
    ended_at: null,
    sleep_hours: null,
    discomfort: null,
    updated_at: `${date}T20:00:00.000Z`,
    deleted_at: null,
    ...extra,
  }
}

test('cierra las sesiones de días anteriores con la hora de su última serie', async () => {
  await db.sessions.bulkPut([
    session('ayer', '2026-10-21'),
    session('ayer-vacia', '2026-10-21'),
    session('cerrada', '2026-10-20', { ended_at: '2026-10-20T21:00:00.000Z' }),
    session('borrada', '2026-10-20', { deleted_at: '2026-10-20T21:00:00.000Z' }),
    session('hoy', '2026-10-22'),
  ])
  await db.set_logs.bulkPut(
    ['21:05', '21:40'].map((time, i) => ({
      id: `set-${i}`,
      session_id: 'ayer',
      exercise_id: 'ex',
      routine_day_exercise_id: null,
      set_number: i + 1,
      weight_kg: 80,
      reps: 8,
      rir: 2,
      interaction_ms: null,
      logged_at: `2026-10-21T${time}:00.000Z`,
      updated_at: `2026-10-21T${time}:00.000Z`,
      deleted_at: null,
    })),
  )

  expect(await closeStaleSessions('2026-10-22')).toBe(2)
  stopSync()

  expect((await db.sessions.get('ayer'))?.ended_at).toBe('2026-10-21T21:40:00.000Z')
  expect((await db.sessions.get('ayer-vacia'))?.ended_at).toBe('2026-10-21T20:00:00.000Z')
  expect((await db.sessions.get('hoy'))?.ended_at).toBeNull()
  expect((await db.sessions.get('cerrada'))?.ended_at).toBe('2026-10-20T21:00:00.000Z')
  // Las cerradas suben como cualquier cambio
  expect(await db.outbox.count()).toBe(2)
})
