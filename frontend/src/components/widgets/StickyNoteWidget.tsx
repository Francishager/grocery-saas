import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, Trash2, Pin, PinOff } from 'lucide-react'

interface StickyNote {
  id: string
  content: string
  color: string
  pinned: boolean
  createdAt: number
  updatedAt: number
}

const COLORS = [
  { name: 'yellow', bg: '#fef9c3', border: '#fde047', accent: '#ca8a04' },
  { name: 'pink', bg: '#fce7f3', border: '#f9a8d4', accent: '#be185d' },
  { name: 'blue', bg: '#dbeafe', border: '#93c5fd', accent: '#1d4ed8' },
  { name: 'green', bg: '#dcfce7', border: '#86efac', accent: '#15803d' },
  { name: 'orange', bg: '#ffedd5', border: '#fdba74', accent: '#c2410c' },
  { name: 'purple', bg: '#f3e8ff', border: '#c084fc', accent: '#7e22ce' },
]

function loadNotes(): StickyNote[] {
  try {
    const raw = localStorage.getItem('sticky_notes')
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

function saveNotes(notes: StickyNote[]) {
  try {
    localStorage.setItem('sticky_notes', JSON.stringify(notes))
  } catch {}
}

export function StickyNoteWidget() {
  const [notes, setNotes] = useState<StickyNote[]>(loadNotes)
  const [activeId, setActiveId] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Initialize: create first note if empty, or select first
  useEffect(() => {
    if (notes.length === 0) {
      const newNote: StickyNote = {
        id: `note_${Date.now()}`,
        content: '',
        color: 'yellow',
        pinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      setNotes([newNote])
      setActiveId(newNote.id)
    } else if (!activeId) {
      // Select pinned note first, or most recent
      const pinned = notes.find((n) => n.pinned)
      setActiveId(pinned?.id || notes[0].id)
    }
  }, [notes, activeId])

  // Debounced save
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveNotes(notes), 400)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [notes])

  const activeNote = notes.find((n) => n.id === activeId) || notes[0]

  const updateContent = (content: string) => {
    if (!activeNote) return
    setNotes((prev) =>
      prev.map((n) => (n.id === activeNote.id ? { ...n, content, updatedAt: Date.now() } : n))
    )
  }

  const addNote = () => {
    const colors = ['yellow', 'pink', 'blue', 'green', 'orange', 'purple']
    const newNote: StickyNote = {
      id: `note_${Date.now()}`,
      content: '',
      color: colors[notes.length % colors.length],
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setNotes((prev) => [...prev, newNote])
    setActiveId(newNote.id)
  }

  const deleteNote = (id: string) => {
    setNotes((prev) => {
      const filtered = prev.filter((n) => n.id !== id)
      if (filtered.length === 0) {
        const newNote: StickyNote = {
          id: `note_${Date.now()}`,
          content: '',
          color: 'yellow',
          pinned: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        setActiveId(newNote.id)
        return [newNote]
      }
      if (id === activeId) setActiveId(filtered[0].id)
      return filtered
    })
  }

  const changeColor = (color: string) => {
    if (!activeNote) return
    setNotes((prev) => prev.map((n) => (n.id === activeNote.id ? { ...n, color } : n)))
  }

  const togglePin = (id: string) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)))
  }

  const colorObj = COLORS.find((c) => c.name === activeNote?.color) || COLORS[0]
  const sortedNotes = [...notes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return b.updatedAt - a.updatedAt
  })

  return (
    <div className="flex flex-col h-full" style={{ background: colorObj.bg }}>
      {/* Note tabs */}
      {sortedNotes.length > 1 && (
        <div className="flex gap-1 px-2 pt-2 pb-1 overflow-x-auto no-drag" style={{ background: `${colorObj.bg}` }}>
          {sortedNotes.map((n) => {
            const nc = COLORS.find((c) => c.name === n.color) || COLORS[0]
            return (
              <button
                key={n.id}
                onClick={() => setActiveId(n.id)}
                className={`shrink-0 px-2 py-0.5 text-xs rounded-t-md border-b-2 transition-all ${
                  n.id === activeId ? 'font-semibold' : 'opacity-60 hover:opacity-100'
                }`}
                style={{
                  background: nc.bg,
                  borderColor: n.id === activeId ? nc.accent : 'transparent',
                  color: nc.accent,
                }}
              >
                {n.pinned && '📌 '}
                {n.content.slice(0, 12) || 'New note'}
                {n.content.length > 12 ? '…' : ''}
              </button>
            )
          })}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 no-drag" style={{ background: `${colorObj.bg}` }}>
        <button
          onClick={addNote}
          className="p-1 rounded hover:bg-black/10 transition-colors"
          style={{ color: colorObj.accent }}
          title="New note"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          onClick={() => activeNote && togglePin(activeNote.id)}
          className="p-1 rounded hover:bg-black/10 transition-colors"
          style={{ color: colorObj.accent }}
          title={activeNote?.pinned ? 'Unpin' : 'Pin'}
        >
          {activeNote?.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        </button>
        <button
          onClick={() => activeNote && deleteNote(activeNote.id)}
          className="p-1 rounded hover:bg-black/10 transition-colors"
          style={{ color: colorObj.accent }}
          title="Delete note"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <div className="flex-1" />
        {/* Color picker */}
        <div className="flex gap-0.5">
          {COLORS.map((c) => (
            <button
              key={c.name}
              onClick={() => changeColor(c.name)}
              className={`w-4 h-4 rounded-full border transition-all ${
                activeNote?.color === c.name ? 'ring-2 ring-offset-1 scale-110' : 'hover:scale-110'
              }`}
              style={{ background: c.bg, borderColor: c.border }}
              title={c.name}
            />
          ))}
        </div>
      </div>

      {/* Note content */}
      <textarea
        value={activeNote?.content || ''}
        onChange={(e) => updateContent(e.target.value)}
        placeholder="Write something..."
        className="flex-1 w-full p-4 resize-none outline-none border-none no-drag"
        style={{
          background: colorObj.bg,
          color: '#1c1917',
          fontFamily: "'Caveat', cursive",
          fontSize: '20px',
          lineHeight: '1.5',
          boxShadow: 'inset 0 0 20px rgba(0,0,0,0.03)',
        }}
        autoFocus
      />

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1 text-[10px] no-drag" style={{ color: colorObj.accent, background: colorObj.bg }}>
        <span>{activeNote?.content.length || 0} chars</span>
        <span>{notes.length} note{notes.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  )
}
