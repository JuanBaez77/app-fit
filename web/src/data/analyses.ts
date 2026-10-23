import { request } from '../api/client'
import { db } from '../db/db'
import type { Iso, LocalDate, Routine } from '../db/types'
import { localDate } from '../lib/dates'
import { requestSync, syncNow } from '../sync/engine'

/** 1w: la última semana; 4w: las últimas 4; version: desde que rige la rutina vigente. */
export type AnalysisWindow = '1w' | '4w' | 'version'

export type ExerciseStatus = 'progresa' | 'mantiene' | 'estancado' | 'retrocede' | 'sin_datos'
export type Basis = 'evidencia' | 'practica'

/**
 * La llamada a Claude tarda un par de minutos y el proxy espera hasta 300 s. Un poco más acá,
 * para que el corte lo dé el servidor con su motivo y no el celular.
 */
export const ANALYSIS_TIMEOUT_MS = 320_000

export interface AnalysisSummary {
  id: string
  created_at: Iso
  window_from: LocalDate
  window_to: LocalDate
  status: 'ok' | 'fallido'
  routine_id: string
  brain_version: string
  model: string
}

export interface ExerciseAssessment {
  exercise_id: string
  status: ExerciseStatus
  comment: string
  basis: Basis
  evidence_links: string[]
}

export interface MuscleAssessment {
  muscle_id: string
  verdict: 'por_debajo' | 'en_rango' | 'por_encima' | 'sin_objetivo'
  comment: string
  evidence_links: string[]
}

export interface Alert {
  kind: 'sobreentrenamiento' | 'musculo_descuidado' | 'datos' | 'seguridad' | 'otro'
  severity: 'info' | 'aviso' | 'importante'
  text: string
}

/** Lo que devolvió el brain, ya validado: sin citas inexistentes ni cambios inaplicables. */
export interface BrainResponse {
  summary: string
  confidence: 'alta' | 'media' | 'baja'
  confidence_reason: string
  exercise_assessments: ExerciseAssessment[]
  muscle_assessments: MuscleAssessment[]
  alerts: Alert[]
  data_gaps: string[]
  notes: string[]
}

/** Ids reales de la versión analizada, valor de antes y de después. Cada tipo usa algunos. */
export interface ChangeTarget {
  routine_day_exercise_id?: string
  routine_day_id?: string
  muscle_id?: string
  from?: number | number[] | null
  to?: number | number[] | null
  from_exercise_id?: string
  to_exercise_id?: string | null
  exercise_id?: string | null
  new_exercise?: { name: string } | null
  position?: number | null
  sets?: number
  reps?: number[]
  rir?: number[] | null
  rest_s?: number[] | null
  range?: number[] | null
}

export type ChangeType =
  | 'set_sets'
  | 'set_rep_range'
  | 'set_rir'
  | 'set_rest'
  | 'swap_exercise'
  | 'add_exercise'
  | 'remove_exercise'
  | 'set_muscle_target'

export interface AnalysisChange {
  id: string
  position: number
  type: ChangeType
  target: ChangeTarget
  title: string
  rationale: string | null
  expectation: string | null
  basis: Basis | null
  evidence_level: number | null
  evidence_links: string[] | null
  dropped_links: string[] | null
  status: 'pendiente' | 'aceptado' | 'rechazado' | 'obsoleto'
  decided_at: Iso | null
  applied_routine_id: string | null
}

/** Las cifras que calculó la app y se mandaron al brain: de acá salen los números de la pantalla. */
export interface AnalysisMetrics {
  window: { from: LocalDate; to: LocalDate; week_starts: LocalDate[]; label: string }
  routine: {
    version: number
    muscle_targets: {
      muscle_id: string
      target: number
      range: [number, number] | null
      fractional_target: number | null
    }[]
  } | null
  metrics: {
    adherence: { planned: number; done: number }
    weekly_volume: {
      week_start: LocalDate
      muscles: Record<string, { direct: number; fractional: number }>
    }[]
    exercises: {
      exercise_id: string
      name: string
      sessions_in_window: number
      status_app: ExerciseStatus
      best_e1rm_kg: { value: number; date: LocalDate } | null
    }[]
    data_quality: { sets_total: number; rir_logged_pct: number | null }
  }
}

export interface Analysis extends AnalysisSummary {
  prompt_version: string
  error: string | null
  metrics: AnalysisMetrics
  response: BrainResponse | null
  discarded: { position: number; type: string; title: string; reason: string }[] | null
  changes: AnalysisChange[]
}

/** No se pudo subir lo que está en el celular: el análisis no saldría con los datos de hoy. */
export class SyncFailed extends Error {}

/**
 * Pide un análisis (US-16). Sincroniza antes, para que el análisis vea lo último que se
 * registró. Si la API de Claude falla, vuelve igual: el análisis queda fallido con el motivo.
 */
export async function requestAnalysis(span: AnalysisWindow): Promise<Analysis> {
  const outcome = await syncNow()
  if (outcome !== 'ok') {
    throw new SyncFailed(
      outcome === 'offline'
        ? 'Sin conexión: no se pudieron subir los datos antes de analizar.'
        : 'No se pudieron subir los datos del celular. Probá de nuevo en un rato.',
    )
  }
  return request<Analysis>('/analyses', {
    method: 'POST',
    body: JSON.stringify({ window: span, today: localDate() }),
    signal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
  })
}

export function listAnalyses(): Promise<AnalysisSummary[]> {
  return request<AnalysisSummary[]>('/analyses')
}

export function getAnalysis(id: string): Promise<Analysis> {
  return request<Analysis>(`/analyses/${id}`)
}

export interface Decision {
  change: AnalysisChange
  /** La versión que creó, si se aceptó */
  routine: Routine | null
  /** Por qué quedó obsoleto, si ya no aplicaba */
  reason: string | null
}

/**
 * Acepta o rechaza un cambio (US-18). Aceptar crea una versión nueva en la API; como en el
 * editor, queda en el celular sin esperar al pull. Un ejercicio nuevo llega con el pull.
 */
export async function decideChange(
  analysisId: string,
  changeId: string,
  verb: 'accept' | 'reject',
): Promise<Decision> {
  const decision = await request<Decision>(`/analyses/${analysisId}/changes/${changeId}/${verb}`, {
    method: 'POST',
  })
  const created = decision.routine
  if (created) {
    // En una transacción: nunca hay dos vigentes en el celular
    await db.transaction('rw', db.routines, async () => {
      await db.routines.where('status').equals('vigente').modify({ status: 'historica' })
      await db.routines.put(created)
    })
    requestSync()
  }
  return decision
}

/** El último análisis completo, o null si nunca se pidió uno. */
export async function latestAnalysis(): Promise<Analysis | null> {
  const [last] = await listAnalyses()
  return last ? getAnalysis(last.id) : null
}
