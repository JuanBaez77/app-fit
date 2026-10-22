// Cliente de la API. El token de acceso vive solo en memoria; el refresh va en una cookie
// httpOnly que el navegador manda únicamente a /api/auth.

const BASE = '/api'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** No hubo respuesta del servidor: sin red, o la API caída. */
export class NetworkError extends Error {}

interface TokenOut {
  access_token: string
}

let accessToken: string | null = null
let refreshing: Promise<boolean> | null = null
let onSessionExpired: () => void = () => {}

export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler
}

export function clearSession(): void {
  accessToken = null
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  try {
    return await fetch(BASE + path, { ...init, headers, credentials: 'same-origin' })
  } catch {
    throw new NetworkError('Sin conexión con el servidor')
  }
}

async function errorFrom(response: Response): Promise<ApiError> {
  let message = `Error ${response.status}`
  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string') {
      message = body.detail
    }
  } catch {
    // La respuesta no traía JSON
  }
  return new ApiError(response.status, message)
}

/**
 * Pide un token nuevo con la cookie de refresh. Hay un solo pedido en vuelo a la vez:
 * el servidor rota la cookie, y dos refresh con la misma cookie se leen como robo.
 */
export function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const response = await send('/auth/refresh', { method: 'POST' })
      if (!response.ok) {
        accessToken = null
        return false
      }
      accessToken = ((await response.json()) as TokenOut).access_token
      return true
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response = await send(path, init)
  if (response.status === 401) {
    if (await refresh()) {
      response = await send(path, init)
    } else {
      onSessionExpired()
    }
  }
  if (!response.ok) throw await errorFrom(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export async function login(email: string, password: string): Promise<void> {
  const response = await send('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) throw await errorFrom(response)
  accessToken = ((await response.json()) as TokenOut).access_token
}

export async function logout(): Promise<void> {
  try {
    await send('/auth/logout', { method: 'POST' })
  } finally {
    accessToken = null
  }
}
