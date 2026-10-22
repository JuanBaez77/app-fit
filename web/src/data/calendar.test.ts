import { describe, expect, test } from 'vitest'
import type { Session } from '../db/types'
import { routine } from '../test-data'
import { missedPlanned, monthGrid, trainedSessions, weekStats } from './calendar'

function session(id: string, date: string, deleted = false): Session {
  return {
    id,
    routine_id: 'r1',
    routine_day_id: null,
    date,
    started_at: null,
    ended_at: null,
    sleep_hours: null,
    discomfort: null,
    updated_at: '',
    deleted_at: deleted ? '2026-10-01T00:00:00Z' : null,
  }
}

describe('calendario', () => {
  test('una sesión cuenta como entrenada si tiene series y no está borrada', () => {
    const sessions = [
      session('a', '2026-10-19'),
      session('b', '2026-10-20'),
      session('c', '2026-10-21', true),
    ]
    const sets = new Map([
      ['a', 3],
      ['c', 2],
    ])

    expect(trainedSessions(sessions, sets).map((s) => s.id)).toEqual(['a'])
  })

  test('el mes en semanas de lunes a domingo', () => {
    // Octubre de 2026 arranca un jueves
    const grid = monthGrid(2026, 9)

    expect(grid[0]).toEqual([
      null,
      null,
      null,
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ])
    expect(grid.at(-1)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      null,
    ])
  })

  test('esta semana, racha y promedio de las 3 anteriores', () => {
    const trained = [
      // Semana del 5: 2 de 2
      session('1', '2026-10-05'),
      session('2', '2026-10-06'),
      // Semana del 12: 2 de 2
      session('3', '2026-10-12'),
      session('4', '2026-10-14'),
      // Semana del 19: 1 de 2, corta la racha hacia atrás
      session('5', '2026-10-20'),
      // Semana del 26, en curso: 2 de 2
      session('6', '2026-10-26'),
      session('7', '2026-10-27'),
    ]

    const stats = weekStats(trained, 2, '2026-10-28')

    expect(stats.thisWeek).toEqual({ done: 2, planned: 2 })
    expect(stats.streak).toBe(1)
    expect(stats.averageLast3).toBeCloseTo(5 / 3)
  })

  test('la semana en curso sin terminar no corta la racha', () => {
    const trained = [
      session('1', '2026-10-19'),
      session('2', '2026-10-20'),
      session('3', '2026-10-26'),
    ]

    expect(weekStats(trained, 2, '2026-10-27').streak).toBe(1)
  })

  test('planificado y no hecho: días de la rutina ya pasados y sin entrenar', () => {
    // La rutina de prueba tiene lunes y martes
    const base = routine({ start_on: '2026-10-19' })
    const trained = new Set(['2026-10-19'])

    expect(missedPlanned('2026-10-20', base, trained, '2026-10-22')).toBe(true)
    expect(missedPlanned('2026-10-19', base, trained, '2026-10-22')).toBe(false)
    expect(missedPlanned('2026-10-21', base, trained, '2026-10-22')).toBe(false)
    expect(missedPlanned('2026-10-26', base, trained, '2026-10-22')).toBe(false)
    expect(missedPlanned('2026-10-13', base, trained, '2026-10-22')).toBe(false)
  })
})
