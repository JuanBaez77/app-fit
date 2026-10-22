import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { db } from './db/db'
import { resetSyncForTests } from './sync/engine'

// jsdom no trae ResizeObserver, y los gráficos de Recharts lo usan
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(async () => {
  cleanup()
  resetSyncForTests()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  await db.delete({ disableAutoOpen: false })
})
