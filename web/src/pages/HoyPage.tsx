import { useAuth } from '../auth/context'

// PR-11 trae la sesión del día y el botón Empezar.
export default function HoyPage() {
  const { state, signOut } = useAuth()

  return (
    <main>
      <header className="page-header">
        <h1>Hoy</h1>
        <button type="button" className="link" onClick={() => void signOut()}>
          Salir
        </button>
      </header>
      {state.status === 'authenticated' && state.offline && (
        <p className="notice">Sin conexión: estás usando la app con el último usuario.</p>
      )}
    </main>
  )
}
