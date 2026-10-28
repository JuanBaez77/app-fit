/** Un anillo como los de Fitness: se cierra al llegar a la meta. Decorativo: el número va al lado. */
export default function Ring({ value, max }: { value: number; max: number }) {
  const r = 13
  const length = 2 * Math.PI * r
  const filled = max > 0 ? Math.min(1, value / max) * length : 0
  return (
    <svg className="stat-ring" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
      <circle className="track" cx="16" cy="16" r={r} />
      {filled > 0 && (
        <circle
          className="fill"
          cx="16"
          cy="16"
          r={r}
          strokeDasharray={`${filled} ${length}`}
          transform="rotate(-90 16 16)"
        />
      )}
    </svg>
  )
}
