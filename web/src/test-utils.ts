import { vi } from 'vitest'

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>

/** Respuesta JSON para usar en los fetch simulados. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Reemplaza fetch por rutas simuladas: { 'POST /api/auth/login': handler }.
 * Una ruta sin handler falla el test.
 */
export function mockFetch(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`
    // Si no hay una ruta exacta, prueba sin la query string
    const handler = routes[key] ?? routes[key.split('?')[0]!]
    if (!handler) throw new Error(`fetch sin simular: ${key}`)
    return handler(init)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Cuenta las llamadas a una ruta del fetch simulado. */
export function callsTo(fetchMock: ReturnType<typeof mockFetch>, key: string): number {
  return fetchMock.mock.calls.filter(
    ([input, init]) => `${init?.method ?? 'GET'} ${String(input)}` === key,
  ).length
}
