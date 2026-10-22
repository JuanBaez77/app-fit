import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  login,
  logout,
  NetworkError,
  refresh,
  request,
  setSessionExpiredHandler,
} from '../api/client'
import { AuthContext, type AuthState, type User } from './context'

// El último usuario queda guardado para poder abrir la app sin red en el gimnasio
const USER_KEY = 'appfit.user'

function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

function cacheUser(user: User | null): void {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_KEY)
  } catch {
    // Sin almacenamiento: la app sigue andando, pero sin red pide login
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Con un usuario conocido la app abre al instante (la meta es abrir la sesión del día en menos
  // de 1,5 s) y la sesión se verifica en segundo plano
  const [state, setState] = useState<AuthState>(() => {
    const cached = readCachedUser()
    return cached
      ? { status: 'authenticated', user: cached, offline: true }
      : { status: 'checking' }
  })

  useEffect(() => {
    let cancelled = false
    const update = (next: AuthState) => {
      if (!cancelled) setState(next)
    }
    setSessionExpiredHandler(() => {
      cacheUser(null)
      setState({ status: 'anonymous' })
    })

    void (async () => {
      try {
        if (!(await refresh())) {
          cacheUser(null)
          update({ status: 'anonymous' })
          return
        }
        const user = await request<User>('/me')
        cacheUser(user)
        update({ status: 'authenticated', user, offline: false })
      } catch (error) {
        // Sin red se sigue con el último usuario; el resto de los errores piden login
        const cached = readCachedUser()
        if (!(error instanceof NetworkError && cached)) update({ status: 'anonymous' })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    await login(email, password)
    const user = await request<User>('/me')
    cacheUser(user)
    setState({ status: 'authenticated', user, offline: false })
  }, [])

  const signOut = useCallback(async () => {
    try {
      await logout()
    } catch {
      // Sin red igual se sale en el dispositivo
    }
    cacheUser(null)
    setState({ status: 'anonymous' })
  }, [])

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut])
  return <AuthContext value={value}>{children}</AuthContext>
}
