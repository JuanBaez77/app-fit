import { beforeEach, describe, expect, test } from 'vitest'
import { clearSession } from '../api/client'
import { db, ensureUser } from '../db/db'
import type { Session } from '../db/types'
import { newId, saveRow } from '../db/write'
import { json, mockFetch } from '../test-utils'
import { stopSync, syncNow } from './engine'

beforeEach(() => clearSession())

function sessionRow(extra: Partial<Session> = {}): Omit<Session, 'updated_at'> {
  return {
    id: newId(),
    routine_id: null,
    routine_day_id: null,
    date: '2026-10-22',
    started_at: '2026-10-22T21:00:00.000Z',
    ended_at: null,
    sleep_hours: null,
    discomfort: null,
    deleted_at: null,
    ...extra,
  }
}

const EMPTY_PULL = {
  cursor: '2026-10-22T21:00:00+00:00',
  sessions: [],
  set_logs: [],
  body_weights: [],
  exercises: [],
  routines: [],
  profile: null,
  muscles: [],
}

/** Un servidor de mentira que, como la API, guarda las filas por id. */
function fakeServer() {
  const sessions = new Map<string, Session>()
  let pushes = 0
  const fetchMock = mockFetch({
    'POST /api/sync/push': (init) => {
      pushes += 1
      const body = JSON.parse(String(init?.body)) as { sessions: Session[] }
      body.sessions.forEach((s) => sessions.set(s.id, s))
      return json({ applied: body.sessions.length, skipped: 0, rejected: [] })
    },
    'GET /api/sync/pull': () => json({ ...EMPTY_PULL, sessions: [...sessions.values()] }),
  })
  return { sessions, fetchMock, pushes: () => pushes }
}

describe('saveRow', () => {
  test('guarda la fila y la encola en la misma escritura', async () => {
    const saved = await saveRow('sessions', sessionRow())
    stopSync()

    expect(await db.sessions.get(saved.id)).toEqual(saved)
    expect(await db.outbox.get(`sessions:${saved.id}`)).toMatchObject({
      table: 'sessions',
      rowId: saved.id,
    })
  })

  test('editar la misma fila deja una sola entrada en la cola', async () => {
    const saved = await saveRow('sessions', sessionRow())
    await saveRow('sessions', { ...saved, sleep_hours: 7.5 })
    stopSync()

    expect(await db.outbox.count()).toBe(1)
  })
})

describe('syncNow', () => {
  test('sube la cola, la vacía, baja lo nuevo y guarda el cursor', async () => {
    const server = fakeServer()
    const saved = await saveRow('sessions', sessionRow())

    expect(await syncNow()).toBe('ok')

    expect(server.sessions.has(saved.id)).toBe(true)
    expect(await db.outbox.count()).toBe(0)
    expect((await db.meta.get('cursor'))?.value).toBe(EMPTY_PULL.cursor)
  })

  test('baja la rutina, el perfil y los músculos', async () => {
    mockFetch({
      'GET /api/sync/pull': () =>
        json({
          ...EMPTY_PULL,
          routines: [{ id: 'r1', version: 1, status: 'vigente', days: [], muscle_targets: [] }],
          profile: { weight_step_kg: 2.5, updated_at: EMPTY_PULL.cursor },
          muscles: [{ id: 'pectoral', name: 'Pectoral', parent_id: null }],
        }),
    })

    await syncNow()

    expect(await db.routines.get('r1')).toMatchObject({ status: 'vigente' })
    expect(await db.profile.get('me')).toMatchObject({ weight_step_kg: 2.5 })
    expect(await db.muscles.count()).toBe(1)
  })

  test('sin red la cola queda, y al volver sube sin duplicar', async () => {
    const saved = await saveRow('sessions', sessionRow())
    mockFetch({
      'POST /api/sync/push': () => {
        throw new TypeError('Failed to fetch')
      },
    })

    expect(await syncNow()).toBe('offline')
    expect(await db.outbox.count()).toBe(1)

    const server = fakeServer()
    expect(await syncNow()).toBe('ok')
    expect(await db.outbox.count()).toBe(0)
    expect([...server.sessions.keys()]).toEqual([saved.id])
  })

  test('si se corta la respuesta, el reintento manda la misma fila y no se duplica', async () => {
    await saveRow('sessions', sessionRow())
    const server = fakeServer()
    const push = server.fetchMock.getMockImplementation()!
    let cut = true
    server.fetchMock.mockImplementation(async (input, init) => {
      const response = await push(input, init)
      // El servidor ya guardó, pero la respuesta no llega
      if (cut && String(input).includes('/sync/push')) {
        cut = false
        throw new TypeError('Failed to fetch')
      }
      return response
    })

    expect(await syncNow()).toBe('offline')
    expect(await syncNow()).toBe('ok')

    expect(server.pushes()).toBe(2)
    expect(server.sessions.size).toBe(1)
    expect(await db.outbox.count()).toBe(0)
  })

  test('una fila que cambió mientras viajaba queda en la cola y el pull no la pisa', async () => {
    const saved = await saveRow('sessions', sessionRow())
    const serverCopy = { ...saved }
    mockFetch({
      'POST /api/sync/push': async () => {
        // Mientras viaja, se edita en el celular
        await saveRow('sessions', { ...saved, sleep_hours: 6 })
        return json({ applied: 1, skipped: 0, rejected: [] })
      },
      'GET /api/sync/pull': () => json({ ...EMPTY_PULL, sessions: [serverCopy] }),
    })

    await syncNow()
    stopSync()

    expect(await db.outbox.count()).toBe(1)
    expect((await db.sessions.get(saved.id))?.sleep_hours).toBe(6)
  })

  test('una sola corrida a la vez', async () => {
    const server = fakeServer()
    await saveRow('sessions', sessionRow())

    await Promise.all([syncNow(), syncNow(), syncNow()])

    expect(server.pushes()).toBe(1)
  })

  test('sesión vencida: avisa y no reintenta solo', async () => {
    await saveRow('sessions', sessionRow())
    mockFetch({
      'POST /api/sync/push': () => json({ detail: 'Sesión vencida' }, 401),
      'POST /api/auth/refresh': () => json({ detail: 'Sesión vencida' }, 401),
    })

    expect(await syncNow()).toBe('unauthorized')
    expect(await db.outbox.count()).toBe(1)
  })
})

describe('ensureUser', () => {
  test('si entra otro usuario, borra lo local del anterior', async () => {
    await ensureUser('u1')
    await db.sessions.put({ ...sessionRow(), updated_at: EMPTY_PULL.cursor })

    await ensureUser('u1')
    expect(await db.sessions.count()).toBe(1)

    await ensureUser('u2')
    expect(await db.sessions.count()).toBe(0)
    expect((await db.meta.get('userId'))?.value).toBe('u2')
  })
})
