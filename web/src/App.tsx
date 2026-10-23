import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { useAuth } from './auth/context'
import Layout from './components/Layout'
import HoyPage from './pages/HoyPage'
import LoginPage from './pages/LoginPage'
import CalendarPage from './pages/CalendarPage'
import Placeholder from './pages/Placeholder'
import SettingsPage from './pages/SettingsPage'
import SessionPage from './pages/SessionPage'
import SyncProvider from './sync/SyncProvider'

// Los gráficos (Recharts) pesan: se cargan recién al abrir Progreso, así el registro abre rápido
const ProgressPage = lazy(() => import('./pages/ProgressPage'))

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
          <Route path="ajustes" element={<SettingsPage />} />
          <Route
            path="progreso"
            element={
              <Suspense fallback={<p className="muted">Cargando…</p>}>
                <ProgressPage />
              </Suspense>
            }
          />
          <Route path="analisis" element={<Placeholder title="Análisis" comingIn="PR-27" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </SyncProvider>
  )
}
