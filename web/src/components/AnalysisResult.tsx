import type { Analysis, AnalysisMetrics, Basis, ExerciseStatus } from '../data/analyses'
import { parseLocalDate, shortDate } from '../lib/dates'
import { decimal, kg } from '../lib/format'

const STATUS: Record<ExerciseStatus, { symbol: string; label: string }> = {
  progresa: { symbol: '↑', label: 'progresa' },
  mantiene: { symbol: '=', label: 'mantiene' },
  estancado: { symbol: '⚠', label: 'estancado' },
  retrocede: { symbol: '↓', label: 'retrocede' },
  sin_datos: { symbol: '–', label: 'sin datos' },
}

const SEVERITY = { info: 'Info', aviso: 'Aviso', importante: 'Importante' } as const

const DAY_MS = 24 * 60 * 60 * 1000

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Series fraccionales por semana de cada músculo, en promedio sobre la ventana. */
function weeklyAverage(metrics: AnalysisMetrics): Map<string, number> {
  const days =
    (parseLocalDate(metrics.window.to).getTime() - parseLocalDate(metrics.window.from).getTime()) /
      DAY_MS +
    1
  // Una ventana de menos de una semana muestra el total, no lo estira a 7 días
  const weeks = Math.max(Math.round(days) / 7, 1)
  const totals = new Map<string, number>()
  for (const week of metrics.metrics.weekly_volume) {
    for (const [muscle, volume] of Object.entries(week.muscles)) {
      totals.set(muscle, (totals.get(muscle) ?? 0) + volume.fractional)
    }
  }
  return new Map([...totals].map(([muscle, total]) => [muscle, total / weeks]))
}

/** De dónde sale una afirmación: evidencia (con nivel y páginas del brain) o práctica. */
function BasisLine({
  basis,
  links,
  level = null,
}: {
  basis: Basis
  links: string[]
  level?: number | null
}) {
  const kind = basis === 'evidencia' ? `evidencia${level ? ` · nivel ${level}` : ''}` : 'práctica'
  return (
    <p className="basis muted">
      Base: {kind}
      {links.length > 0 && ` · ${links.map((link) => `[[${link}]]`).join(' ')}`}
    </p>
  )
}

/**
 * El diagnóstico (US-17). Las cifras salen de lo que calculó la app y se mandó al brain; del
 * modelo son solo los comentarios, cada uno con su base.
 */
export default function AnalysisResult({
  analysis,
  muscleName,
}: {
  analysis: Analysis
  muscleName: (id: string) => string
}) {
  const { metrics, response } = analysis
  const period = `Del ${shortDate(analysis.window_from)} al ${shortDate(analysis.window_to)}`

  if (analysis.status === 'fallido' || !response) {
    return (
      <section aria-label="Resultado" className="analysis">
        <p className="muted">{period}</p>
        <div role="alert" className="notice">
          <p className="error">El análisis falló.</p>
          <p>{analysis.error ?? 'Sin motivo registrado.'}</p>
          <p className="muted">Quedó guardado con el motivo. Podés pedir otro.</p>
        </div>
      </section>
    )
  }

  const assessments = new Map(response.exercise_assessments.map((a) => [a.exercise_id, a]))
  const verdicts = new Map(response.muscle_assessments.map((a) => [a.muscle_id, a]))
  const average = weeklyAverage(metrics)
  const targets = metrics.routine?.muscle_targets ?? []
  // Primero los de la tabla de la rutina; después los que el brain comentó sin meta
  const muscles = [
    ...targets.map((t) => t.muscle_id),
    ...response.muscle_assessments
      .map((a) => a.muscle_id)
      .filter((id) => !targets.some((t) => t.muscle_id === id)),
  ]
  const { adherence, data_quality: quality } = metrics.metrics

  return (
    <section aria-label="Resultado" className="analysis">
      <p className="muted">{period}</p>

      <section aria-labelledby="analysis-summary">
        <div className="analysis-heading">
          <h2 id="analysis-summary">Resumen</h2>
          <span>Confianza: {response.confidence}</span>
        </div>
        <p>{response.summary}</p>
        <p className="muted">{response.confidence_reason}</p>
      </section>

      <section aria-labelledby="analysis-exercises">
        <h2 id="analysis-exercises">Ejercicios</h2>
        <ul className="assessments">
          {metrics.metrics.exercises.map((exercise) => {
            const status = STATUS[exercise.status_app]
            const brain = assessments.get(exercise.exercise_id)
            return (
              <li key={exercise.exercise_id} aria-label={exercise.name}>
                <div className="analysis-heading">
                  <strong>{exercise.name}</strong>
                  <span className={`status status-${exercise.status_app}`}>
                    {status.symbol} {status.label}
                  </span>
                </div>
                <p className="muted">
                  {exercise.sessions_in_window === 0
                    ? 'Sin sesiones en la ventana'
                    : count(exercise.sessions_in_window, 'sesión', 'sesiones')}
                  {exercise.best_e1rm_kg &&
                    ` · mejor 1RM estimado ${kg(exercise.best_e1rm_kg.value)} kg el ${shortDate(exercise.best_e1rm_kg.date)}`}
                </p>
                {brain && (
                  <>
                    <p>{brain.comment}</p>
                    {brain.status !== exercise.status_app && (
                      <p className="muted">El brain lo lee como {STATUS[brain.status].label}.</p>
                    )}
                    <BasisLine basis={brain.basis} links={brain.evidence_links} />
                  </>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {muscles.length > 0 && (
        <section aria-labelledby="analysis-volume">
          <h2 id="analysis-volume">Volumen vs. meta</h2>
          <p className="muted legend">
            Series fraccionales por semana, en promedio; la indirecta vale 0,5.
          </p>
          <ul className="assessments">
            {muscles.map((id) => {
              const target = targets.find((t) => t.muscle_id === id)
              const goal = target ? (target.fractional_target ?? target.target) : null
              const done = average.get(id) ?? 0
              const verdict = verdicts.get(id)
              return (
                <li key={id} aria-label={muscleName(id)}>
                  <div className="muscle-row">
                    <span className="muscle-name">{muscleName(id)}</span>
                    <span className="muscle-count">
                      {goal === null
                        ? `${decimal(done)} · sin meta`
                        : `${decimal(done)} de ${decimal(goal)}`}
                    </span>
                    <span className="bar" aria-hidden="true">
                      <span
                        className={goal !== null && done >= goal ? 'bar-fill met' : 'bar-fill'}
                        style={{ width: `${goal ? Math.min(done / goal, 1) * 100 : 0}%` }}
                      />
                    </span>
                  </div>
                  {verdict && (
                    <>
                      <p>{verdict.comment}</p>
                      {/* Sin una página que exista no hay evidencia verificable */}
                      <BasisLine
                        basis={verdict.evidence_links.length ? 'evidencia' : 'practica'}
                        links={verdict.evidence_links}
                      />
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {response.alerts.length > 0 && (
        <section aria-labelledby="analysis-alerts">
          <h2 id="analysis-alerts">Alertas</h2>
          <ul className="assessments">
            {response.alerts.map((alert, index) => (
              <li key={index} className={`alert-${alert.severity}`}>
                <strong>
                  {alert.severity === 'info' ? '' : '⚠ '}
                  {SEVERITY[alert.severity]}:
                </strong>{' '}
                {alert.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="analysis-data">
        <h2 id="analysis-data">Datos</h2>
        <p className="muted">
          {adherence.planned > 0 &&
            `Entrenaste ${adherence.done} de ${adherence.planned} días planificados · `}
          {count(quality.sets_total, 'serie', 'series')}
          {quality.rir_logged_pct !== null &&
            ` · RIR registrado en ${Math.round(quality.rir_logged_pct * 100)} %`}
        </p>
        {response.data_gaps.length > 0 && (
          <ul className="assessments" aria-label="Datos que faltan">
            {response.data_gaps.map((gap, index) => (
              <li key={index}>⚠ {gap}</li>
            ))}
          </ul>
        )}
      </section>

      {response.notes.length > 0 && (
        <section aria-labelledby="analysis-notes">
          <h2 id="analysis-notes">Notas</h2>
          <ul className="assessments">
            {response.notes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        </section>
      )}

      {analysis.changes.length > 0 && (
        <section aria-labelledby="analysis-changes">
          <h2 id="analysis-changes">Cambios propuestos</h2>
          <ol className="assessments">
            {analysis.changes.map((change) => (
              <li key={change.id}>{change.title}</li>
            ))}
          </ol>
          <p className="muted">Aceptarlos o rechazarlos llega en PR-28.</p>
        </section>
      )}
    </section>
  )
}
