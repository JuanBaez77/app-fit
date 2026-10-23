import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError, NetworkError, request } from '../api/client'
import { useCurrentRoutine, useHasSynced, useSessionsOn } from '../data/hooks'
import { startSession } from '../data/sessions'
import type { Routine, RoutineDay } from '../db/types'
import { isoWeekday, localDate, weekdayName } from '../lib/dates'
import { syncNow } from '../sync/engine'

export default function HoyPage() {
  const routine = useCurrentRoutine()
  const todaySessions = useSessionsOn(localDate())
  const hasSynced = useHasSynced()

  return (
    <main>
      <header className="page-header">
        <h1>Hoy</h1>
        <nav className="header-links" aria-label="Rutina y ajustes">
          <Link to="/rutina" className="link">
            Rutina
          </Link>
          <Link to="/ajustes" className="link">
            Ajustes
          </Link>
        </nav>
      </header>
      {routine === undefined || todaySessions === undefined ? null : routine === null ? (
        <FirstUse hasSynced={hasSynced ?? false} />
      ) : (
        <Today
          routine={routine}
          openSessionId={todaySessions.find((s) => !s.ended_at)?.id}
          doneDays={todaySessions.filter((s) => s.ended_at).map((s) => s.routine_day_id)}
        />
      )}
    </main>
  )
}

function Today({
  routine,
  openSessionId,
  doneDays,
}: {
  routine: Routine
  openSessionId: string | undefined
  doneDays: (string | null)[]
}) {
  const navigate = useNavigate()
  const [choosing, setChoosing] = useState(false)
  const weekday = isoWeekday()
  const planned = routine.days.find((d) => d.weekday === weekday)

  async function start(day: RoutineDay) {
    const session = await startSession(routine, day)
    navigate(`/sesion/${session.id}`)
  }

  if (openSessionId) {
    return (
      <section className="card">
        <p className="muted">Tenés una sesión abierta de hoy.</p>
        <button
          type="button"
          className="primary big"
          onClick={() => navigate(`/sesion/${openSessionId}`)}
        >
          Seguir la sesión
        </button>
      </section>
    )
  }

  const showList = choosing || !planned
  return (
    <>
      {planned && !choosing && (
        <section className="card">
          <p className="muted">
            {weekdayName(weekday)} · rutina v{routine.version}
          </p>
          <h2>{planned.name}</h2>
          <p className="muted">{planned.exercises.length} ejercicios</p>
          {doneDays.includes(planned.id) && <p className="notice">Ya la hiciste hoy.</p>}
          <button type="button" className="primary big" onClick={() => void start(planned)}>
            Empezar
          </button>
        </section>
      )}
      {!planned && (
        <section className="card">
          <h2>Hoy es día de descanso</h2>
          <p className="muted">Si querés entrenar igual, elegí una sesión.</p>
        </section>
      )}
      {showList ? (
        <section aria-label="Elegir sesión" className="day-list">
          {routine.days.map((day) => (
            <button key={day.id} type="button" onClick={() => void start(day)}>
              <span>{day.name}</span>
              <span className="muted">
                {day.weekday ? `${weekdayName(day.weekday)} · ` : ''}
                {day.exercises.length} ejercicios
              </span>
            </button>
          ))}
        </section>
      ) : (
        <button type="button" className="link" onClick={() => setChoosing(true)}>
          Elegir otra sesión
        </button>
      )}
    </>
  )
}

function FirstUse({ hasSynced }: { hasSynced: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function importRoutine() {
    setBusy(true)
    setError(null)
    try {
      await request('/routines/import', { method: 'POST' })
      await syncNow()
    } catch (err) {
      setError(
        err instanceof NetworkError
          ? 'Sin conexión. La primera carga necesita internet.'
          : err instanceof ApiError
            ? err.message
            : 'No se pudo importar la rutina.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>Todavía no hay rutina</h2>
      <p className="muted">
        {hasSynced
          ? 'Cargá tu rutina vigente (rutina-2026-10-20) con sus 5 días.'
          : 'Si ya la importaste en otro dispositivo, va a aparecer al sincronizar.'}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        type="button"
        className="primary big"
        disabled={busy}
        onClick={() => void importRoutine()}
      >
        {busy ? 'Importando…' : 'Importar rutina'}
      </button>
    </section>
  )
}
