import type { Trend } from '../metrics'

const LABELS: Record<Trend, { symbol: string; label: string }> = {
  up: { symbol: '↑', label: 'mejora' },
  same: { symbol: '=', label: 'igual' },
  down: { symbol: '↓', label: 'retroceso' },
}

/** ↑ = ↓ contra la misma serie de la última vez. Nunca usa solo el color. */
export default function TrendMark({ trend }: { trend: Trend }) {
  const { symbol, label } = LABELS[trend]
  return (
    <span className={`trend trend-${trend}`} title={label} aria-label={label}>
      {symbol}
    </span>
  )
}
