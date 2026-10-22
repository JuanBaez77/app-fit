import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import SetPanel from './SetPanel'

function renderPanel(onSave = vi.fn().mockResolvedValue(undefined)) {
  render(
    <SetPanel
      title="Serie 1"
      initial={{ weight_kg: 80, reps: 8 }}
      weightStep={2.5}
      onSave={onSave}
    />,
  )
  return onSave
}

test('mide del primer toque sobre el panel al toque que guarda', async () => {
  const now = vi.spyOn(performance, 'now')
  const onSave = renderPanel()

  now.mockReturnValue(1_000)
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Más peso' }))
  fireEvent.click(screen.getByRole('button', { name: 'Más peso' }))
  now.mockReturnValue(1_200)
  fireEvent.pointerDown(screen.getByRole('button', { name: 'RIR 2: guardar' }))
  now.mockReturnValue(4_250)
  fireEvent.click(screen.getByRole('button', { name: 'RIR 2: guardar' }))

  await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
  expect(onSave).toHaveBeenCalledWith({ weight_kg: 82.5, reps: 8, rir: 2 }, 3_250)
})

test('una serie sin cambios mide el único toque', async () => {
  const now = vi.spyOn(performance, 'now')
  const onSave = renderPanel()

  now.mockReturnValue(500)
  fireEvent.pointerDown(screen.getByRole('button', { name: 'RIR 1: guardar' }))
  now.mockReturnValue(620)
  fireEvent.click(screen.getByRole('button', { name: 'RIR 1: guardar' }))

  await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
  expect(onSave.mock.calls[0]![1]).toBe(120)
})

test('un doble toque no guarda dos veces', async () => {
  let finish: () => void = () => {}
  const onSave = renderPanel(vi.fn(() => new Promise<void>((resolve) => (finish = resolve))))

  fireEvent.click(screen.getByRole('button', { name: 'RIR 2: guardar' }))
  fireEvent.click(screen.getByRole('button', { name: 'RIR 2: guardar' }))
  finish()

  await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
})
