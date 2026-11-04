import { useEffect, useId, useRef, type ReactNode } from 'react'

/**
 * Hoja que sube desde abajo, como las de iOS: oscurece lo de atrás y se cierra tocando afuera o
 * con Escape. Al cerrarse, el foco vuelve a donde estaba.
 */
export default function Sheet({
  title,
  onClose,
  action,
  children,
}: {
  title: string
  onClose: () => void
  /** A la derecha del título: "Listo", "Cancelar" */
  action?: ReactNode
  children: ReactNode
}) {
  const titleId = useId()
  const sheet = useRef<HTMLDivElement>(null)
  // El último onClose, sin volver a correr el efecto (que movería el foco) en cada render
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    sheet.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [])

  return (
    <div className="sheet-layer">
      <div className="sheet-backdrop" aria-hidden="true" onClick={() => close.current()} />
      <div
        ref={sheet}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="sheet-grabber" aria-hidden="true" />
        <header className="sheet-header">
          <h2 id={titleId}>{title}</h2>
          {action}
        </header>
        {children}
      </div>
    </div>
  )
}
