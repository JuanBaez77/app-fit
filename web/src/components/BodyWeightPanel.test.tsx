import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { db } from '../db/db'
import type { BodyWeight } from '../db/types'
import { STAMP } from '../test-data'
import BodyWeightPanel from './BodyWeightPanel'

function weight(id: string, date: string, kg: number): BodyWeight {
  return { id, date, kg, updated_at: STAMP, deleted_at: null }
}

beforeEach(async () => {
  // Jueves 22: la semana empieza el lunes 19
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 22, 8, 0))
  await db.body_weights.bulkPut([
    weight('w1', '2026-10-13', 82),
    weight('w2', '2026-10-15', 83),
    weight('w3', '2026-10-20', 81),
  ])
})

async function type(value: string) {
  const field = await screen.findByLabelText('Peso de hoy (kg)')
  await userEvent.clear(field)
  await userEvent.type(field, value)
}

test('anota el peso de hoy y queda en la cola para sincronizar', async () => {
  render(<BodyWeightPanel />)

  await userEvent.click(await screen.findByRole('button', { name: 'Anotar el peso de hoy' }))
  await type('80,6')
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

  expect(await screen.findByRole('status')).toHaveTextContent('Guardado: 80,6 kg')
  const saved = await db.body_weights.where('date').equals('2026-10-22').toArray()
  expect(saved).toMatchObject([{ kg: 80.6, deleted_at: null }])
  expect(await db.outbox.get(`body_weights:${saved[0]!.id}`)).toBeDefined()

  // (81 + 80,6) / 2 = 80,8 contra 82,5 de la semana anterior
  expect(await screen.findByText('80,8')).toBeInTheDocument()
  expect(screen.getByText('-2,1 % contra la anterior')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Cambiar el peso de hoy (80,6 kg)' }),
  ).toBeInTheDocument()
})

test('si hoy ya tiene peso, se edita en la misma fila', async () => {
  await db.body_weights.put(weight('hoy', '2026-10-22', 81.5))
  render(<BodyWeightPanel />)

  await userEvent.click(
    await screen.findByRole('button', { name: 'Cambiar el peso de hoy (81,5 kg)' }),
  )
  expect(screen.getByLabelText('Peso de hoy (kg)')).toHaveValue('81,5')
  await type('81')
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

  await screen.findByRole('status')
  expect(await db.body_weights.where('date').equals('2026-10-22').toArray()).toMatchObject([
    { id: 'hoy', kg: 81 },
  ])
})

test('Cancelar no guarda nada', async () => {
  render(<BodyWeightPanel />)

  await userEvent.click(await screen.findByRole('button', { name: 'Anotar el peso de hoy' }))
  await type('79')
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

  expect(screen.queryByLabelText('Peso de hoy (kg)')).not.toBeInTheDocument()
  expect(await db.body_weights.count()).toBe(3)
})

test('el promedio por semana con su variación', async () => {
  render(<BodyWeightPanel />)

  const list = await screen.findByRole('list', { name: 'Promedio por semana' })
  expect(
    within(list)
      .getAllByRole('listitem')
      .map((r) => r.textContent),
  ).toEqual(['Esta semana1 pesaje81 kg-1,8 %', '12–18 oct2 pesajes82,5 kg—'])
  expect(screen.getByText('Promedio de esta semana')).toBeInTheDocument()
  expect(screen.getByText('-1,8 % contra la anterior')).toBeInTheDocument()
})

test('un peso que no es un número no se guarda', async () => {
  render(<BodyWeightPanel />)

  await userEvent.click(await screen.findByRole('button', { name: 'Anotar el peso de hoy' }))
  await type('ochenta')
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

  expect(screen.getByRole('alert')).toHaveTextContent('Escribí el peso en kg')
  expect(await db.body_weights.count()).toBe(3)
})

test('sin pesos, invita a anotar el primero', async () => {
  await db.body_weights.clear()
  render(<BodyWeightPanel />)

  expect(await screen.findByText('Todavía no hay pesos cargados.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Anotar el peso de hoy' })).toBeInTheDocument()
})
