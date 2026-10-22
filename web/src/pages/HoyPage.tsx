import { useAuth } from '../auth/context'

// PR-11 trae la sesión del día y el botón Empezar.
export default function HoyPage() {
  const { signOut } = useAuth()

  return (
    <main>
      <header className="page-header">
        <h1>Hoy</h1>
        <button type="button" className="link" onClick={() => void signOut()}>
          Salir
        </button>
      </header>
    </main>
  )
}
