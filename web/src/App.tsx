import { Navigate, Route, Routes } from 'react-router'
import { useAuth } from './auth/context'
import Layout from './components/Layout'
import HoyPage from './pages/HoyPage'
import LoginPage from './pages/LoginPage'
import CalendarPage from './pages/CalendarPage'
import Placeholder from './pages/Placeholder'
import SessionPage from './pages/SessionPage'
import SyncProvider from './sync/SyncProvider'

export default function App() {
  const { state } = useAuth()

  if (state.status === 'checking') {
    return (
      <main className="splash" aria-busy="true">
        <p className="muted">Cargando…</p>
      </main>
    )
  }
  if (state.status === 'anonymous') {
    return <LoginPage />
  }
  return (
    <SyncProvider userId={state.user.id}>
      <Routes>
        {/* El registro ocupa toda la pantalla, sin la barra inferior */}
        <Route path="sesion/:id" element={<SessionPage />} />
        <Route element={<Layout />}>
          <Route index element={<HoyPage />} />
          <Route path="calendario" element={<CalendarPage />} />
          <Route path="progreso" element={<Placeholder title="Progreso" comingIn="PR-20" />} />
          <Route path="analisis" element={<Placeholder title="Análisis" comingIn="PR-27" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </SyncProvider>
  )
}
