import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { decimal } from '../lib/format'

export interface ChartPoint {
  key: string
  label: string
  value: number
}

/**
 * Gráfico de línea al modo de la app Salud: líneas guía horizontales finas, los valores a la
 * derecha y sin cartel. Tocar el gráfico elige el punto más cercano; el dato grande lo muestra
 * quien lo usa, arriba del gráfico.
 */
export default function TrendChart({
  points,
  selected,
  onSelect,
  label,
  color = 'var(--accent)',
}: {
  points: ChartPoint[]
  selected: string | null
  onSelect: (key: string) => void
  label: string
  color?: string
}) {
  // Sin elegir, se destaca el último: es el dato que muestra el número grande
  const highlighted = selected ?? points.at(-1)?.key

  return (
    <div className="trend-chart" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart
          data={points}
          margin={{ top: 12, right: 0, bottom: 0, left: 0 }}
          onClick={(state) => {
            const point = points[Number(state.activeTooltipIndex)]
            if (point) onSelect(point.key)
          }}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
            // Lugar para que la primera y la última fecha no se corten en el borde
            padding={{ left: 20, right: 12 }}
            tick={{ fontSize: 12, fill: 'var(--muted)' }}
          />
          <YAxis
            orientation="right"
            domain={['auto', 'auto']}
            axisLine={false}
            tickLine={false}
            tickCount={4}
            width={48}
            tick={{ fontSize: 12, fill: 'var(--muted)' }}
            tickFormatter={(value) => decimal(Number(value))}
          />
          {/* Sin cartel: solo la línea vertical mientras se toca */}
          <Tooltip content={() => null} cursor={{ stroke: 'var(--muted)' }} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.5}
            isAnimationActive={false}
            activeDot={false}
            dot={({ cx, cy, index }) => {
              const on = points[index]?.key === highlighted
              return (
                <circle
                  key={index}
                  cx={cx}
                  cy={cy}
                  r={on ? 5.5 : 3}
                  fill={color}
                  stroke={on ? 'var(--bg)' : 'none'}
                  strokeWidth={2}
                />
              )
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
