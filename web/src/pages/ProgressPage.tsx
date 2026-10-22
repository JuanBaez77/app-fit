import { useState } from 'react'
import ExerciseProgress from '../components/ExerciseProgress'

const TABS = ['Ejercicio', 'Músculos', 'Peso corporal'] as const
type Tab = (typeof TABS)[number]

/** Progreso: un gráfico por ejercicio, el volumen por músculo y el peso corporal. */
export default function ProgressPage() {
  const [tab, setTab] = useState<Tab>('Ejercicio')

  return (
    <main>
      <header className="page-header">
        <h1>Progreso</h1>
      </header>
      <div className="segmented" role="tablist" aria-label="Vista">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={tab}>
        {tab === 'Ejercicio' && <ExerciseProgress />}
        {tab === 'Músculos' && <p className="muted">Llega en PR-21.</p>}
        {tab === 'Peso corporal' && <p className="muted">Llega en PR-22.</p>}
      </div>
    </main>
  )
}
