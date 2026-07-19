import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Minus, X } from 'lucide-react'

interface FloatingWidgetProps {
  id: string
  title: string
  icon?: ReactNode
  children: ReactNode
  onClose: () => void
  defaultWidth?: number
  defaultHeight?: number
  minWidth?: number
  minHeight?: number
  accentColor?: string
}

interface WidgetPosition {
  x: number
  y: number
  width: number
  height: number
  minimized: boolean
}

function loadPosition(id: string): WidgetPosition | null {
  try {
    const raw = localStorage.getItem(`widget_pos_${id}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function savePosition(id: string, pos: WidgetPosition) {
  try {
    localStorage.setItem(`widget_pos_${id}`, JSON.stringify(pos))
  } catch {}
}

export function FloatingWidget({
  id,
  title,
  icon,
  children,
  onClose,
  defaultWidth = 280,
  defaultHeight = 360,
  minWidth = 220,
  minHeight = 160,
  accentColor = '#f59e0b',
}: FloatingWidgetProps) {
  const [pos, setPos] = useState<WidgetPosition>(() => {
    const saved = loadPosition(id)
    if (saved) return saved
    const x = Math.max(20, window.innerWidth - defaultWidth - 40)
    const y = Math.max(80, window.innerHeight - defaultHeight - 40)
    return { x, y, width: defaultWidth, height: defaultHeight, minimized: false }
  })

  const draggingRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const resizingRef = useRef(false)
  const resizeStartRef = useRef({ x: 0, y: 0, w: 0, h: 0 })
  const [isDragging, setIsDragging] = useState(false)

  // Clamp position within viewport
  const clampPos = useCallback((x: number, y: number) => {
    return {
      x: Math.max(0, Math.min(x, window.innerWidth - 60)),
      y: Math.max(0, Math.min(y, window.innerHeight - 60)),
    }
  }, [])

  // Drag handlers
  const handleDragStart = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea, .no-drag')) return
    draggingRef.current = true
    setIsDragging(true)
    dragOffsetRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    e.preventDefault()
  }

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (draggingRef.current) {
      const { x, y } = clampPos(e.clientX - dragOffsetRef.current.x, e.clientY - dragOffsetRef.current.y)
      setPos((prev) => ({ ...prev, x, y }))
    } else if (resizingRef.current) {
      const dw = e.clientX - resizeStartRef.current.x
      const dh = e.clientY - resizeStartRef.current.y
      setPos((prev) => ({
        ...prev,
        width: Math.max(minWidth, resizeStartRef.current.w + dw),
        height: Math.max(minHeight, resizeStartRef.current.h + dh),
      }))
    }
  }, [clampPos, minWidth, minHeight])

  const handlePointerUp = useCallback(() => {
    if (draggingRef.current || resizingRef.current) {
      setPos((prev) => {
        savePosition(id, prev)
        return prev
      })
    }
    draggingRef.current = false
    resizingRef.current = false
    setIsDragging(false)
  }, [id])

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [handlePointerMove, handlePointerUp])

  const handleResizeStart = (e: React.PointerEvent) => {
    resizingRef.current = true
    resizeStartRef.current = { x: e.clientX, y: e.clientY, w: pos.width, h: pos.height }
    e.preventDefault()
    e.stopPropagation()
  }

  const toggleMinimize = () => {
    setPos((prev) => {
      const next = { ...prev, minimized: !prev.minimized }
      savePosition(id, next)
      return next
    })
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: pos.minimized ? 'auto' : pos.width,
        height: pos.minimized ? 'auto' : pos.height,
        zIndex: 9999,
        touchAction: 'none',
      }}
      className="select-none"
    >
      <div
        className="rounded-xl shadow-2xl border border-black/10 bg-white overflow-hidden flex flex-col"
        style={{ height: pos.minimized ? 'auto' : '100%' }}
      >
        {/* Header / Drag bar */}
        <div
          onPointerDown={handleDragStart}
          className="flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing"
          style={{
            background: `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)`,
            opacity: isDragging ? 0.9 : 1,
            touchAction: 'none',
            userSelect: 'none',
          }}
        >
          <div className="flex items-center gap-2 text-white">
            {icon}
            <span className="text-sm font-semibold truncate">{title}</span>
          </div>
          <div className="flex items-center gap-1 no-drag">
            <button
              onClick={toggleMinimize}
              className="p-1 text-white/80 hover:text-white hover:bg-white/20 rounded transition-colors"
              title={pos.minimized ? 'Expand' : 'Minimize'}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1 text-white/80 hover:text-white hover:bg-white/20 rounded transition-colors"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        {!pos.minimized && (
          <div className="flex-1 overflow-auto relative">
            {children}
            {/* Resize handle */}
            <div
              onPointerDown={handleResizeStart}
              className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
              style={{
                background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.15) 50%)',
                touchAction: 'none',
              }}
            />
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
