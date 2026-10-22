import { createContext, useContext } from 'react'

export interface User {
  id: string
  email: string
}

export type AuthState =
  | { status: 'checking' }
  | { status: 'anonymous' }
  // offline: se entró con el último usuario conocido porque no había red
  | { status: 'authenticated'; user: User; offline: boolean }

export interface AuthContextValue {
  state: AuthState
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth necesita un AuthProvider')
  return value
}
