import type { Basis } from '../data/analyses'

/** De dónde sale una afirmación: evidencia (con nivel y páginas del brain) o práctica. */
export default function BasisLine({
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
