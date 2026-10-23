import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import { AuthContext } from '../auth/context'
import { db } from '../db/db'
import type { Profile } from '../db/types'
import { DEFAULT_PROFILE } from '../data/profile'
import { STAMP } from '../test-data'
import { callsTo, json, mockFetch } from '../test-utils'
import SettingsPage from './SettingsPage'

const PROFILE: Profile = {
  ...DEFAULT_PROFILE,
  height_cm: 175.5,
  phase: 'definicion',
  phase_start: '2026-10-01',
  priority_muscles: ['pectoral'],
  updated_at: STAMP,
}

const signOut = vi.fn()

function renderSettings() {
  const auth = {
    state: { status: 'authenticated' as const, user: { id: 'u1', email: 'a@b.c' }, offline: false },
    signIn: vi.fn(),
    signOut,
  }
  return render(
    <AuthContext value={auth}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </AuthContext>,
  )
}

beforeEach(async () => {
  // Ya sincronizó una vez
  await db.meta.put({ key: 'cursor', value: '2026-10-22T12:00:00.000Z' })
  await db.muscles.bulkPut([
    { id: 'pectoral', name: 'Pectoral', parent_id: null },
    { id: 'deltoides_lateral', name: 'Deltoides lateral', parent_id: null },
  ])
})

test('guarda el paso de peso y la privacidad, y los deja en el celular', async () => {
  await db.profile.put({ key: 'me', ...PROFILE })
  let sent: Record<string, unknown> = {}
  const fetchMock = mockFetch({
    'PUT /api/me/profile': (init) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>
      return json({ ...sent, updated_at: '2026-10-22T20:00:00.000Z' })
    },
  })
  renderSettings()

  const step = await screen.findByRole('combobox', { name: 'Paso de peso de los botones − y +' })
  expect(step).toHaveValue('2.5')
  expect(screen.getByLabelText('Altura (cm)')).toHaveValue('175,5')
  await userEvent.selectOptions(step, '1,25 kg')
  await userEvent.click(await screen.findByLabelText('Deltoides lateral'))
  await userEvent.click(screen.getByLabelText('Enviar las molestias al análisis'))
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

  expect(await screen.findByRole('status')).toHaveTextContent('Guardado.')
  expect(callsTo(fetchMock, 'PUT /api/me/profile')).toBe(1)
  expect(sent).toMatchObject({
    weight_step_kg: 1.25,
    height_cm: 175.5,
    phase: 'definicion',
    priority_muscles: ['pectoral', 'deltoides_lateral'],
    send_discomfort_to_ai: true,
    limitations: null,
  })
  expect(sent).not.toHaveProperty('updated_at')
  // El registro lee el paso de acá
  expect(await db.profile.get('me')).toMatchObject({ weight_step_kg: 1.25 })
})

test('sin conexión avisa y no cambia lo guardado', async () => {
  await db.profile.put({ key: 'me', ...PROFILE })
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
  renderSettings()

  await userEvent.selectOptions(
    await screen.findByRole('combobox', { name: 'Paso de peso de los botones − y +' }),
    '5 kg',
  )
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
  expect(await db.profile.get('me')).toMatchObject({ weight_step_kg: 2.5 })
})

test('un número inválido no se manda', async () => {
  const fetchMock = mockFetch({})
  renderSettings()

  await userEvent.type(await screen.findByLabelText('RIR habitual'), '1,5')
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

  expect(screen.getByRole('alert')).toHaveTextContent('Revisá el RIR habitual.')
  expect(fetchMock).not.toHaveBeenCalled()
})

test('sin perfil todavía arranca con 2,5 kg y las molestias apagadas', async () => {
  renderSettings()

  expect(
    await screen.findByRole('combobox', { name: 'Paso de peso de los botones − y +' }),
  ).toHaveValue('2.5')
  expect(screen.getByLabelText('Enviar las molestias al análisis')).not.toBeChecked()
})

test('salir de la cuenta', async () => {
  renderSettings()

  await userEvent.click(await screen.findByRole('button', { name: 'Salir de la cuenta' }))

  expect(signOut).toHaveBeenCalledOnce()
})

test('antes de la primera sincronización no muestra un formulario vacío', async () => {
  await db.meta.delete('cursor')
  renderSettings()

  expect(await screen.findByText(/llega con la primera sincronización/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()

  // Llega el pull: perfil y cursor juntos
  await db.transaction('rw', db.profile, db.meta, async () => {
    await db.profile.put({ key: 'me', ...PROFILE })
    await db.meta.put({ key: 'cursor', value: '2026-10-22T12:00:00.000Z' })
  })

  expect(await screen.findByRole('combobox', { name: 'Fase' })).toHaveValue('definicion')
  expect(await screen.findByLabelText('Pectoral')).toBeChecked()
})
