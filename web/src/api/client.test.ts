import { beforeEach, describe, expect, test, vi } from 'vitest'
import { callsTo, json, mockFetch } from '../test-utils'
import {
  ApiError,
  clearSession,
  login,
  NetworkError,
  refresh,
  request,
  setSessionExpiredHandler,
} from './client'

beforeEach(() => {
  clearSession()
  setSessionExpiredHandler(() => {})
})

describe('request', () => {
  test('manda el token de acceso después del login', async () => {
    const fetchMock = mockFetch({
      'POST /api/auth/login': () => json({ access_token: 'tok-1' }),
      'GET /api/me': (init) => {
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tok-1')
        return json({ id: 'u1', email: 'a@b.c' })
      },
    })

    await login('a@b.c', 'secreto')

    expect(await request('/me')).toEqual({ id: 'u1', email: 'a@b.c' })
    expect(callsTo(fetchMock, 'GET /api/me')).toBe(1)
  })

  test('ante un 401 renueva el token y reintenta una vez', async () => {
    let meCalls = 0
    mockFetch({
      'POST /api/auth/refresh': () => json({ access_token: 'nuevo' }),
      'GET /api/me': (init) => {
        meCalls += 1
        const auth = new Headers(init?.headers).get('Authorization')
        return auth === 'Bearer nuevo' ? json({ ok: true }) : json({ detail: 'vencido' }, 401)
      },
    })

    expect(await request('/me')).toEqual({ ok: true })
    expect(meCalls).toBe(2)
  })

  test('varios 401 a la vez piden un solo refresh', async () => {
    const fetchMock = mockFetch({
      'POST /api/auth/refresh': async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return json({ access_token: 'nuevo' })
      },
      'GET /api/me': (init) =>
        new Headers(init?.headers).get('Authorization') === 'Bearer nuevo'
          ? json({ ok: true })
          : json({}, 401),
    })

    await Promise.all([request('/me'), request('/me'), request('/me')])

    expect(callsTo(fetchMock, 'POST /api/auth/refresh')).toBe(1)
  })

  test('si el refresh falla, avisa que la sesión venció', async () => {
    const expired = vi.fn()
    setSessionExpiredHandler(expired)
    mockFetch({
      'POST /api/auth/refresh': () => json({ detail: 'Sesión vencida' }, 401),
      'GET /api/me': () => json({ detail: 'Sesión vencida o inválida' }, 401),
    })

    await expect(request('/me')).rejects.toBeInstanceOf(ApiError)
    expect(expired).toHaveBeenCalledOnce()
  })

  test('sin red tira NetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(request('/me')).rejects.toBeInstanceOf(NetworkError)
  })

  test('la API caída detrás del proxy (502–504) es falta de red, no sesión vencida', async () => {
    const expired = vi.fn()
    setSessionExpiredHandler(expired)
    mockFetch({
      'POST /api/auth/refresh': () => new Response('Bad Gateway', { status: 502 }),
      'GET /api/me': () => new Response('', { status: 504 }),
    })

    await expect(refresh()).rejects.toBeInstanceOf(NetworkError)
    await expect(request('/me')).rejects.toBeInstanceOf(NetworkError)
    expect(expired).not.toHaveBeenCalled()
  })

  test('el mensaje de error sale del detail de la API', async () => {
    mockFetch({
      'POST /api/auth/login': () => json({ detail: 'Correo o contraseña incorrectos' }, 401),
    })

    await expect(login('a@b.c', 'mal')).rejects.toThrow('Correo o contraseña incorrectos')
  })
})

describe('timeout', () => {
  test('un pedido colgado pasa a ser falta de red', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('', 'AbortError')),
            )
          }),
      ),
    )

    await expect(request('/me', { signal: AbortSignal.timeout(20) })).rejects.toBeInstanceOf(
      NetworkError,
    )
  })

  test('sin signal propio, cada pedido lleva el tope por defecto', async () => {
    const fetchMock = mockFetch({ 'GET /api/me': () => json({}) })

    await request('/me')

    expect(fetchMock.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal)
  })
})
