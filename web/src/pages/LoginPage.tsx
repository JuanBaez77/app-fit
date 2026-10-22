import { useState, type FormEvent } from 'react'
import { ApiError, NetworkError } from '../api/client'
import { useAuth } from '../auth/context'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
    } catch (err) {
      if (err instanceof NetworkError)
        setError('Sin conexión. El primer ingreso necesita internet.')
      else if (err instanceof ApiError) setError(err.message)
      else setError('Algo salió mal. Probá de nuevo.')
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <h1>app-fit</h1>
      <form onSubmit={onSubmit}>
        <label>
          Correo
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
