import { expect, test } from 'vitest'
import { routine } from '../test-data'
import { daySummary, durationText, nextPlannedDay, weekDates } from './today'

test('el resumen cuenta las series de la semana, con la rampa', () => {
  const torso = routine().days[0]!
  torso.exercises[0] = { ...torso.exercises[0]!, ramp_sets: 2, ramp_weeks: 2 }

  expect(daySummary(torso, 1)).toEqual({ exercises: 2, sets: 5, minutes: 15 })
  expect(daySummary(torso, 3).sets).toBe(6)
})

test('la duración pasa a horas desde los 60 minutos', () => {
  expect(durationText(55)).toBe('~55 min')
  expect(durationText(60)).toBe('~1 h')
  expect(durationText(75)).toBe('~1 h 15 min')
})

test('el próximo día fijo da la vuelta a la semana', () => {
  const r = routine()
  expect(nextPlannedDay(r, 1)?.name).toBe('Pierna A')
  expect(nextPlannedDay(r, 6)?.name).toBe('Torso')
  expect(nextPlannedDay(r, 2)?.name).toBe('Torso')
})

test('la semana va de lunes a domingo', () => {
  expect(weekDates('2026-10-22')).toEqual([
    '2026-10-19',
    '2026-10-20',
    '2026-10-21',
    '2026-10-22',
    '2026-10-23',
    '2026-10-24',
    '2026-10-25',
  ])
})
