import type { ReactNode } from 'react'

// Íconos de trazo redondeado, al modo de SF Symbols. Toman el color del texto.
const PATHS = {
  play: (
    <path
      d="M7 4.8v14.4a1 1 0 0 0 1.5.86l12-7.2a1 1 0 0 0 0-1.72l-12-7.2A1 1 0 0 0 7 4.8z"
      fill="currentColor"
    />
  ),
  chevron: <path d="M9 5.5l6.5 6.5L9 18.5" />,
  chevronLeft: <path d="M15 5.5L8.5 12l6.5 6.5" />,
  // El de los menús de iOS (chevron.up.chevron.down)
  chevronUpDown: <path d="M8 9.5l4-4 4 4M8 14.5l4 4 4-4" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  list: (
    <>
      <path d="M9.5 6h10.5M9.5 12h10.5M9.5 18h10.5" />
      <circle cx="5" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="5" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  gear: (
    <>
      <path d="M10.33 4.32c.43-1.76 2.92-1.76 3.35 0a1.72 1.72 0 0 0 2.57 1.06c1.54-.94 3.31.83 2.37 2.37a1.72 1.72 0 0 0 1.06 2.57c1.76.43 1.76 2.92 0 3.35a1.72 1.72 0 0 0-1.06 2.57c.94 1.54-.83 3.31-2.37 2.37a1.72 1.72 0 0 0-2.57 1.06c-.43 1.76-2.92 1.76-3.35 0a1.72 1.72 0 0 0-2.57-1.06c-1.54.94-3.31-.83-2.37-2.37a1.72 1.72 0 0 0-1.06-2.57c-1.76-.43-1.76-2.92 0-3.35a1.72 1.72 0 0 0 1.06-2.57c-.94-1.54.83-3.31 2.37-2.37a1.72 1.72 0 0 0 2.57-1.06z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  moon: <path d="M12 3a6.5 6.5 0 0 0 9 9 9 9 0 1 1-9-9z" />,
  dumbbell: <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />,
  layers: <path d="M12 4l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  // Los de la barra de pestañas
  flame: (
    <path d="M12 12c2-2.96 0-7-1-8 0 3.04-1.77 4.74-3 6-1.23 1.26-2 3.24-2 5a6 6 0 1 0 12 0c0-1.53-1.06-3.94-2-5-1.79 3-2.79 3-4 2z" />
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.5 10.5h17" />
    </>
  ),
  chart: <path d="M4 4v16h16M8 15l3.5-3.5 3 2.5L20 8.5" />,
  sparkles: (
    <path d="M16 18a2 2 0 0 1 2 2 2 2 0 0 1 2-2 2 2 0 0 1-2-2 2 2 0 0 1-2 2zm0-12a2 2 0 0 1 2 2 2 2 0 0 1 2-2 2 2 0 0 1-2-2 2 2 0 0 1-2 2zM9 18a6 6 0 0 1 6-6 6 6 0 0 1-6-6 6 6 0 0 1-6 6 6 6 0 0 1 6 6z" />
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof PATHS

/** Ícono decorativo: el texto del botón o un aria-label dicen qué es. */
export default function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName
  size?: number
  className?: string
}) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
