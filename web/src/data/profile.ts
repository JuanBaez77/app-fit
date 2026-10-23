import { request } from '../api/client'
import { db } from '../db/db'
import type { Profile } from '../db/types'

export type ProfileInput = Omit<Profile, 'updated_at'>

export const DEFAULT_PROFILE: ProfileInput = {
  sex: null,
  birth_year: null,
  height_cm: null,
  experience_years: null,
  habitual_rir: null,
  goal: null,
  priority_muscles: null,
  phase: null,
  phase_start: null,
  phase_target: null,
  equipment: null,
  limitations: null,
  weight_step_kg: 2.5,
  send_discomfort_to_ai: false,
}

/**
 * Guarda el perfil en la API y, si respondió, en el celular. Necesita conexión: a diferencia de
 * las series, los ajustes no pasan por la cola.
 */
export async function saveProfile(profile: ProfileInput): Promise<Profile> {
  const saved = await request<Profile>('/me/profile', {
    method: 'PUT',
    body: JSON.stringify(profile),
  })
  await db.profile.put({ key: 'me', ...saved })
  return saved
}
