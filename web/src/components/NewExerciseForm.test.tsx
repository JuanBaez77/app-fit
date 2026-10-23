import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { db } from '../db/db'
import { EXERCISES } from '../test-data'
import NewExerciseForm from './NewExerciseForm'

beforeEach(async () => {
  await db.muscles.bulkPut([
    { id: 'pectoral', name: 'Pectoral', parent_id: null },
    { id: 'triceps', name: 'Tríceps', parent_id: null },
  ])
})

function renderForm() {
  const onCreated = vi.fn()
  render(<NewExerciseForm existing={EXERCISES} onCreated={onCreated} onCancel={vi.fn()} />)
  return onCreated
}

test('crea el ejercicio con sus músculos y lo deja en la cola', async () => {
  const onCreated = renderForm()

  await userEvent.type(screen.getByLabelText('Nombre'), 'Fondos en paralelas')
  await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Multiarticular')
  await userEvent.click(screen.getByLabelText(/Con peso corporal/))
  await userEvent.selectOptions(await screen.findByLabelText('Tríceps'), 'Directo (1)')
  await userEvent.selectOptions(screen.getByLabelText('Pectoral'), 'Indirecto (0,5)')
  await userEvent.click(screen.getByRole('button', { name: 'Crear ejercicio' }))

  await vi.waitFor(() => expect(onCreated).toHaveBeenCalledOnce())
  const created = (await db.exercises.toArray())[0]!
  expect(created).toMatchObject({
    name: 'Fondos en paralelas',
    kind: 'multiarticular',
    e1rm_eligible: false,
    muscles: [
      { muscle_id: 'triceps', factor: 1 },
      { muscle_id: 'pectoral', factor: 0.5 },
    ],
  })
  expect(await db.outbox.get(`exercises:${created.id}`)).toBeDefined()
})

test('sin un músculo directo no se puede crear', async () => {
  const onCreated = renderForm()

  await userEvent.type(screen.getByLabelText('Nombre'), 'Fondos')
  await userEvent.selectOptions(await screen.findByLabelText('Tríceps'), 'Indirecto (0,5)')
  await userEvent.click(screen.getByRole('button', { name: 'Crear ejercicio' }))

  expect(screen.getByRole('alert')).toHaveTextContent('al menos un músculo directo')
  expect(onCreated).not.toHaveBeenCalled()
  expect(await db.exercises.count()).toBe(0)
})

test('no repite un nombre del catálogo', async () => {
  const onCreated = renderForm()

  await userEvent.type(screen.getByLabelText('Nombre'), 'remo en t')
  await userEvent.selectOptions(await screen.findByLabelText('Pectoral'), 'Directo (1)')
  await userEvent.click(screen.getByRole('button', { name: 'Crear ejercicio' }))

  expect(screen.getByRole('alert')).toHaveTextContent('Ya hay un ejercicio con ese nombre')
  expect(onCreated).not.toHaveBeenCalled()
})
