import { expect, test } from 'vitest'
import { dayMonth, weekRange } from './dates'

test('el día y el mes, sin puntos ni "de"', () => {
  expect(dayMonth('2026-10-26')).toBe('26 oct')
})

test('la semana del lunes al domingo, también cuando cruza de mes', () => {
  expect(weekRange('2026-10-19')).toBe('19–25 oct')
  expect(weekRange('2026-09-28')).toMatch(/^28 sept? – 4 oct$/)
})
