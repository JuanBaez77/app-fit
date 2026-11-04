import { useRef, type PointerEvent } from 'react'

/** Lo que hay que arrastrar de costado para que cuente como deslizar */
const SWIPE_PX = 50

export type SwipeHandlers = ReturnType<typeof useSwipe>

/**
 * Deslizar de costado, como entre meses en la app Calendario: 1 hacia la izquierda (lo que
 * sigue), -1 hacia la derecha. Lo vertical no cuenta, así sigue siendo scroll; el elemento
 * necesita `touch-action: pan-y`.
 */
export function useSwipe(onSwipe: (direction: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onPointerDown: (e: PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY }
    },
    onPointerUp: (e: PointerEvent) => {
      const from = start.current
      start.current = null
      if (!from) return
      const dx = e.clientX - from.x
      const dy = e.clientY - from.y
      if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > 1.5 * Math.abs(dy)) onSwipe(dx < 0 ? 1 : -1)
    },
    onPointerCancel: () => {
      start.current = null
    },
  }
}
