import { useState } from 'react'
import BodyWeightPanel from '../components/BodyWeightPanel'
import ExerciseProgress from '../components/ExerciseProgress'
import MuscleVolume from '../components/MuscleVolume'

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
        {tab === 'Músculos' && <MuscleVolume />}
        {tab === 'Peso corporal' && <BodyWeightPanel />}
      </div>
    </main>
  )
}
