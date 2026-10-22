import { useSyncStatus } from '../sync/useSync'

function plural(n: number): string {
  return n === 1 ? '1 cambio' : `${n} cambios`
}

/** Aviso discreto del estado de la sincronización. No muestra nada si todo está al día. */
export default function SyncBadge() {
  const { pending, online, error } = useSyncStatus()

  let text: string | null = null
  if (!online || error === 'offline') {
    text = pending
      ? `Sin conexión · ${plural(pending)} guardados en el celular`
      : 'Sin conexión: lo que registres se guarda en el celular'
  } else if (error === 'unauthorized') {
    text = 'La sesión venció: entrá de nuevo para sincronizar'
  } else if (error === 'server') {
    text = `No se pudo sincronizar${pending ? ` · ${plural(pending)} pendientes` : ''}`
  } else if (pending) {
    text = `${plural(pending)} por subir`
  }

  return (
    <p className="sync-badge" role="status" aria-live="polite" hidden={!text}>
      {text}
    </p>
  )
}
