import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router'
import { ApiError, NetworkError } from '../api/client'
import { useAuth } from '../auth/context'
import { useHasSynced, useProfile } from '../data/hooks'
import { DEFAULT_PROFILE, saveProfile, type ProfileInput } from '../data/profile'
import { db } from '../db/db'
import type { Profile } from '../db/types'
import { kg } from '../lib/format'

const WEIGHT_STEPS = [0.5, 1, 1.25, 2, 2.5, 5]

const PHASES = [
  { value: 'definicion', label: 'Definición' },
  { value: 'volumen', label: 'Volumen' },
  { value: 'mantenimiento', label: 'Mantenimiento' },
] as const

/** Los campos que el formulario edita como texto. */
type TextField =
  | 'sex'
  | 'birth_year'
  | 'height_cm'
  | 'experience_years'
  | 'habitual_rir'
  | 'goal'
  | 'phase_start'
  | 'phase_target'
  | 'equipment'
  | 'limitations'

type Draft = Record<TextField, string> &
  Pick<ProfileInput, 'phase' | 'weight_step_kg' | 'send_discomfort_to_ai'> & {
    priority_muscles: string[]
  }

const NUMBERS = {
  birth_year: { label: 'el año de nacimiento', min: 1900, max: 2100, integer: true },
  height_cm: { label: 'la altura', min: 51, max: 259, integer: false },
  experience_years: { label: 'los años entrenando', min: 0, max: 80, integer: false },
  habitual_rir: { label: 'el RIR habitual', min: 0, max: 5, integer: true },
} as const
type NumberField = keyof typeof NUMBERS

const text = (value: string | number | null) => (value === null ? '' : String(value))

function toDraft(profile: ProfileInput): Draft {
  return {
    sex: text(profile.sex),
    birth_year: text(profile.birth_year),
    height_cm: text(profile.height_cm).replace('.', ','),
    experience_years: text(profile.experience_years).replace('.', ','),
    habitual_rir: text(profile.habitual_rir),
    goal: text(profile.goal),
    phase: profile.phase,
    phase_start: text(profile.phase_start),
    phase_target: text(profile.phase_target),
    equipment: text(profile.equipment),
    limitations: text(profile.limitations),
    weight_step_kg: profile.weight_step_kg,
    priority_muscles: profile.priority_muscles ?? [],
    send_discomfort_to_ai: profile.send_discomfort_to_ai,
  }
}

/** Un número opcional: vacío es null; 'invalid' si no se entiende o está fuera de rango. */
function parseNumber(value: string, field: NumberField): number | null | 'invalid' {
  if (!value.trim()) return null
  const { min, max, integer } = NUMBERS[field]
  const parsed = Number(value.replace(',', '.').trim())
  const ok =
    Number.isFinite(parsed) &&
    parsed >= min &&
    parsed <= max &&
    (!integer || Number.isInteger(parsed))
  return ok ? parsed : 'invalid'
}

const optional = (value: string) => value.trim() || null

/** Convierte el borrador al perfil; si un número está mal, devuelve qué campo revisar. */
function fromDraft(draft: Draft): ProfileInput | string {
  const numbers = {} as Record<NumberField, number | null>
  for (const field of Object.keys(NUMBERS) as NumberField[]) {
    const value = parseNumber(draft[field], field)
    if (value === 'invalid') return NUMBERS[field].label
    numbers[field] = value
  }
  return {
    ...numbers,
    sex: optional(draft.sex),
    goal: optional(draft.goal),
    priority_muscles: draft.priority_muscles.length ? draft.priority_muscles : null,
    phase: draft.phase,
    phase_start: optional(draft.phase_start),
    phase_target: optional(draft.phase_target),
    equipment: optional(draft.equipment),
    limitations: optional(draft.limitations),
    weight_step_kg: draft.weight_step_kg,
    send_discomfort_to_ai: draft.send_discomfort_to_ai,
  }
}

/** Ajustes: el paso de peso, la fase, el perfil que lee el brain y la privacidad. */
export default function SettingsPage() {
  const { signOut } = useAuth()
  const profile = useProfile()
  const hasSynced = useHasSynced()

  return (
    <main>
      <header className="page-header">
        <h1>Ajustes</h1>
        <Link to="/" className="link">
          Volver
        </Link>
      </header>
      {profile === undefined || hasSynced === undefined ? null : hasSynced ? (
        // El pull guarda el perfil y el cursor juntos: con cursor, un perfil vacío es que
        // todavía no se importó la rutina. Antes, el formulario arrancaría vacío y al guardar
        // borraría el perfil del servidor.
        <SettingsForm profile={profile ?? DEFAULT_PROFILE} />
      ) : (
        <p className="muted">
          Tu perfil llega con la primera sincronización, cuando haya conexión.
        </p>
      )}
      <button type="button" className="danger" onClick={() => void signOut()}>
        Salir de la cuenta
      </button>
    </main>
  )
}

function SettingsForm({ profile }: { profile: ProfileInput }) {
  const [draft, setDraft] = useState(() => toDraft(profile))
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const muscles = useLiveQuery(() => db.muscles.toArray(), [])

  function set<K extends keyof Draft>(name: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [name]: value }))
    setMessage(null)
  }

  const field = (name: TextField) => ({
    value: draft[name],
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(name, e.target.value),
  })

  async function submit(event: FormEvent) {
    event.preventDefault()
    const result = fromDraft(draft)
    if (typeof result === 'string') {
      setMessage({ ok: false, text: `Revisá ${result}.` })
      return
    }
    setSaving(true)
    try {
      await saveProfile(result)
      setMessage({ ok: true, text: 'Guardado.' })
    } catch (error) {
      setMessage({
        ok: false,
        text:
          error instanceof NetworkError
            ? 'Sin conexión: los ajustes se guardan cuando hay red.'
            : error instanceof ApiError
              ? error.message
              : 'No se pudo guardar.',
      })
    } finally {
      setSaving(false)
    }
  }

  // Si el perfil tiene un paso que no está en la lista, se ofrece igual
  const steps = WEIGHT_STEPS.includes(draft.weight_step_kg)
    ? WEIGHT_STEPS
    : [...WEIGHT_STEPS, draft.weight_step_kg].sort((a, b) => a - b)

  return (
    <form className="settings" onSubmit={(e) => void submit(e)}>
      <fieldset>
        <legend>Registro</legend>
        <label>
          Paso de peso de los botones − y +
          <select
            value={draft.weight_step_kg}
            onChange={(e) => set('weight_step_kg', Number(e.target.value))}
          >
            {steps.map((step) => (
              <option key={step} value={step}>
                {kg(step)} kg
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>Fase</legend>
        <label>
          Fase
          <select
            value={draft.phase ?? ''}
            onChange={(e) => set('phase', (e.target.value || null) as Profile['phase'])}
          >
            <option value="">Sin definir</option>
            {PHASES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Desde
          <input type="date" {...field('phase_start')} />
        </label>
        <label>
          Hasta (aproximado)
          <input placeholder="inicios de diciembre" maxLength={200} {...field('phase_target')} />
        </label>
      </fieldset>

      <fieldset>
        <legend>Perfil para el análisis</legend>
        <p className="muted">Lo lee el brain. No incluye tu nombre ni tu correo.</p>
        <label>
          Sexo
          <input maxLength={50} {...field('sex')} />
        </label>
        <label>
          Año de nacimiento
          <input inputMode="numeric" {...field('birth_year')} />
        </label>
        <label>
          Altura (cm)
          <input inputMode="decimal" {...field('height_cm')} />
        </label>
        <label>
          Años entrenando
          <input inputMode="decimal" {...field('experience_years')} />
        </label>
        <label>
          RIR habitual
          <input inputMode="numeric" {...field('habitual_rir')} />
        </label>
        <label>
          Objetivo
          <textarea rows={2} maxLength={2000} {...field('goal')} />
        </label>
        <div role="group" aria-label="Músculos prioritarios" className="checks">
          <span>Músculos prioritarios</span>
          {(muscles ?? []).map((m) => (
            <label key={m.id} className="check">
              <input
                type="checkbox"
                checked={draft.priority_muscles.includes(m.id)}
                onChange={(e) =>
                  set(
                    'priority_muscles',
                    e.target.checked
                      ? [...draft.priority_muscles, m.id]
                      : draft.priority_muscles.filter((id) => id !== m.id),
                  )
                }
              />
              {m.name}
            </label>
          ))}
        </div>
        <label>
          Equipamiento
          <textarea rows={2} maxLength={2000} {...field('equipment')} />
        </label>
        <label>
          Limitaciones o lesiones
          <textarea rows={2} maxLength={2000} {...field('limitations')} />
        </label>
      </fieldset>

      <fieldset>
        <legend>Privacidad</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.send_discomfort_to_ai}
            onChange={(e) => set('send_discomfort_to_ai', e.target.checked)}
          />
          Enviar las molestias al análisis
        </label>
        <p className="muted">
          Las molestias que anotás al terminar una sesión son datos de salud. Apagado, quedan solo
          en la app y el brain no las ve.
        </p>
      </fieldset>

      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'muted' : 'error'}>
          {message.text}
        </p>
      )}
      <button type="submit" className="primary" disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}
