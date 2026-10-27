export type PwaUpdateState = {
  updateAvailable: boolean
}

let state: PwaUpdateState = { updateAvailable: false }
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null
const listeners = new Set<() => void>()

export function getPwaUpdateState() {
  return state
}

export function subscribePwaUpdateState(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function publish(next: PwaUpdateState) {
  state = next
  listeners.forEach((listener) => listener())
}

export function setPwaUpdateServiceWorker(update: (reloadPage?: boolean) => Promise<void>) {
  updateServiceWorker = update
}

export function notifyPwaUpdateAvailable() {
  if (!state.updateAvailable) publish({ updateAvailable: true })
}

export async function applyPwaUpdate() {
  if (updateServiceWorker) {
    await updateServiceWorker(true)
    return
  }
  window.location.reload()
}
