import { Navigate, Route, Routes } from 'react-router'
import { useAuth } from './auth/context'
import Layout from './components/Layout'
import HoyPage from './pages/HoyPage'
import LoginPage from './pages/LoginPage'
import Placeholder from './pages/Placeholder'
import SyncProvider from './sync/SyncProvider'

export default function App() {
  const { state } = useAuth()

  if (state.status === 'checking') {
    return <main className="splash" aria-busy="true" />
  }
  if (state.status === 'anonymous') {
    return <LoginPage />
  }
  return (
    <SyncProvider userId={state.user.id}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HoyPage />} />
          <Route path="calendario" element={<Placeholder title="Calendario" comingIn="PR-19" />} />
          <Route path="progreso" element={<Placeholder title="Progreso" comingIn="PR-20" />} />
          <Route path="analisis" element={<Placeholder title="Análisis" comingIn="PR-27" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </SyncProvider>
  )
}
