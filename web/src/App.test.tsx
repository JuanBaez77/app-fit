import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import { clearSession } from './api/client'
import { AuthProvider } from './auth/AuthProvider'
import { json, mockFetch } from './test-utils'

const USER = { id: 'u1', email: 'juan@example.com' }

beforeEach(() => clearSession())

function renderApp() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

test('sin sesión muestra el login, y al entrar muestra las pestañas', async () => {
  mockFetch({
    'POST /api/auth/refresh': () => json({ detail: 'Sesión vencida' }, 401),
    'POST /api/auth/login': () => json({ access_token: 'tok' }),
    'GET /api/me': () => json(USER),
  })
  renderApp()

  await userEvent.type(await screen.findByLabelText('Correo'), USER.email)
  await userEvent.type(screen.getByLabelText('Contraseña'), 'contraseña-larga')
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

  expect(await screen.findByRole('heading', { name: 'Hoy' })).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: 'Secciones' })).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem('appfit.user')!)).toEqual(USER)
})

test('un login rechazado muestra el error de la API', async () => {
  mockFetch({
    'POST /api/auth/refresh': () => json({}, 401),
    'POST /api/auth/login': () => json({ detail: 'Correo o contraseña incorrectos' }, 401),
  })
  renderApp()

  await userEvent.type(await screen.findByLabelText('Correo'), USER.email)
  await userEvent.type(screen.getByLabelText('Contraseña'), 'mal')
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos')
})

test('con la cookie de refresh vigente entra directo', async () => {
  mockFetch({
    'POST /api/auth/refresh': () => json({ access_token: 'tok' }),
    'GET /api/me': () => json(USER),
  })
  renderApp()

  expect(await screen.findByRole('heading', { name: 'Hoy' })).toBeInTheDocument()
})

test('sin red entra con el último usuario conocido', async () => {
  localStorage.setItem('appfit.user', JSON.stringify(USER))
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
  renderApp()

  expect(await screen.findByRole('heading', { name: 'Hoy' })).toBeInTheDocument()
  expect(screen.getByText(/Sin conexión/)).toBeInTheDocument()
})

test('sin red y sin usuario conocido pide login', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
  renderApp()

  expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument()
})
