import { useEffect } from 'react'

const VISIBLE_MS = 5_000

/** "Serie borrada · Deshacer", durante 5 segundos. */
export default function UndoToast({
  message,
  onUndo,
  onClose,
}: {
  message: string
  onUndo: () => void
  onClose: () => void
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="toast" role="status">
      <span>{message}</span>
      <button
        type="button"
        className="link"
        onClick={() => {
          onUndo()
          onClose()
        }}
      >
        Deshacer
      </button>
    </div>
  )
}
