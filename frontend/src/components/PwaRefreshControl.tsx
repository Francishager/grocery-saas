import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent, type KeyboardEvent } from 'react'
import { RefreshCw, Download, Grip } from 'lucide-react'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { Button } from '@/components/ui/button'
import { applyPwaUpdate, getPwaUpdateState, subscribePwaUpdateState } from '@/lib/pwaUpdateState'

export function PwaRefreshControl() {
  const { isAuthenticated } = useJWTAuth()
  const { updateAvailable } = useSyncExternalStore(
    subscribePwaUpdateState,
    getPwaUpdateState,
    getPwaUpdateState,
  )
  const [refreshing, setRefreshing] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const dragOrigin = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null)
  const controlRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('jibusales-pwa-control-position')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) setPosition(parsed)
      }
    } catch { /* Ignore invalid saved placement. */ }
  }, [])

  useEffect(() => {
    if (!position) return
    const clamp = () => {
      const rect = controlRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = Math.max(8, Math.min(position.x, window.innerWidth - rect.width - 8))
      const y = Math.max(8, Math.min(position.y, window.innerHeight - rect.height - 8))
      if (x !== position.x || y !== position.y) setPosition({ x, y })
    }
    window.addEventListener('resize', clamp)
    return () => window.removeEventListener('resize', clamp)
  }, [position])

  if (!isAuthenticated) return null

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      if (updateAvailable) await applyPwaUpdate()
      else window.location.reload()
    } finally {
      setRefreshing(false)
    }
  }

  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 && event.pointerType !== 'touch') return
    const rect = controlRef.current?.getBoundingClientRect()
    if (!rect) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragOrigin.current = { pointerX: event.clientX, pointerY: event.clientY, x: rect.left, y: rect.top }
    setPosition({ x: rect.left, y: rect.top })
  }

  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragOrigin.current || !controlRef.current) return
    const rect = controlRef.current.getBoundingClientRect()
    const x = Math.max(8, Math.min(dragOrigin.current.x + event.clientX - dragOrigin.current.pointerX, window.innerWidth - rect.width - 8))
    const y = Math.max(8, Math.min(dragOrigin.current.y + event.clientY - dragOrigin.current.pointerY, window.innerHeight - rect.height - 8))
    setPosition({ x, y })
  }

  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!dragOrigin.current) return
    dragOrigin.current = null
    const rect = controlRef.current?.getBoundingClientRect()
    if (!rect) return
    const next = { x: rect.left, y: rect.top }
    setPosition(next)
    localStorage.setItem('jibusales-pwa-control-position', JSON.stringify(next))
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const nudge = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    const rect = controlRef.current?.getBoundingClientRect()
    if (!rect) return
    const delta = event.shiftKey ? 40 : 12
    const x = Math.max(8, Math.min(rect.left + (event.key === 'ArrowRight' ? delta : event.key === 'ArrowLeft' ? -delta : 0), window.innerWidth - rect.width - 8))
    const y = Math.max(8, Math.min(rect.top + (event.key === 'ArrowDown' ? delta : event.key === 'ArrowUp' ? -delta : 0), window.innerHeight - rect.height - 8))
    const next = { x, y }
    setPosition(next)
    localStorage.setItem('jibusales-pwa-control-position', JSON.stringify(next))
  }

  return (
    <div
      ref={controlRef}
      className="fixed z-[70]"
      style={{
        ...(position ? { left: position.x, top: position.y } : {
          right: 'calc(env(safe-area-inset-right, 0px) + 1rem)',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
        }),
      }}
    >
      <div className="flex items-center gap-1 rounded-full bg-background/95 p-1 shadow-lg ring-1 ring-border backdrop-blur">
        <button
          type="button"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onKeyDown={nudge}
          aria-label="Move update control. Use arrow keys to reposition."
          title="Drag to move; arrow keys also work"
          className="flex h-9 w-8 touch-none cursor-move items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        ><Grip className="h-4 w-4" /></button>
        <Button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label={updateAvailable ? 'Update JibuSales' : 'Refresh page'}
          title={updateAvailable ? 'A new JibuSales update is ready' : 'Refresh page'}
          className={`h-10 shadow-none ${updateAvailable ? 'gap-2 bg-emerald-700 px-4 text-white hover:bg-emerald-800' : 'w-10 rounded-full p-0'}`}
        >
          {updateAvailable
            ? <><Download className="h-5 w-5" /><span>Update ready</span></>
            : <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />}
        </Button>
      </div>
    </div>
  )
}
