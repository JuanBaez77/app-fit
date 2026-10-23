import { render, screen } from '@testing-library/react'
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
  await userEvent.type(field, value)
}

test('carga el peso de hoy y queda en la cola para sincronizar', async () => {
  render(<BodyWeightPanel />)

  await type('80,6')
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

  expect(await screen.findByRole('status')).toHaveTextContent('Guardado: 80,6 kg')
  const saved = await db.body_weights.where('date').equals('2026-10-22').toArray()
  expect(saved).toMatchObject([{ kg: 80.6, deleted_at: null }])
  expect(await db.outbox.get(`body_weights:${saved[0]!.id}`)).toBeDefined()

  // (81 + 80,6) / 2 = 80,8 contra 82,5 de la semana anterior
  expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual(['80,8 kg', '-2,1 %'])
})

test('si hoy ya tiene peso, lo reemplaza en la misma fila', async () => {
  await db.body_weights.put(weight('hoy', '2026-10-22', 81.5))
  render(<BodyWeightPanel />)

  expect(await screen.findByText('Hoy ya cargaste 81,5 kg.')).toBeInTheDocument()
  await type('81')
  await userEvent.click(screen.getByRole('button', { name: 'Reemplazar' }))

  await screen.findByRole('status')
  expect(await db.body_weights.where('date').equals('2026-10-22').toArray()).toMatchObject([
    { id: 'hoy', kg: 81 },
  ])
})

test('el promedio por semana con su variación', async () => {
  render(<BodyWeightPanel />)

  const rows = (await screen.findAllByRole('row')).slice(1).map((r) => r.textContent)
  expect(rows).toEqual(['lun 19 oct81 kg (1 pesaje)-1,8 %', 'lun 12 oct82,5 kg (2 pesajes)—'])
})

test('un peso que no es un número no se guarda', async () => {
  render(<BodyWeightPanel />)

  await type('ochenta')
  await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))

  expect(screen.getByRole('alert')).toHaveTextContent('Escribí el peso en kg')
  expect(await db.body_weights.count()).toBe(3)
})
