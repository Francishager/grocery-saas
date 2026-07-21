import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, Trash2, Pin, PinOff } from 'lucide-react'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { apiFetch } from '@/lib/api'
 
type LineType = 'text' | 'task' | 'numbered'
 
interface NoteLine {
  id: string
  type: LineType
  text: string
  done: boolean
  number: number
}
 
interface StickyNote {
  id: string
  title: string
  lines: NoteLine[]
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
 
let lineCounter = 0
function makeLine(type: LineType = 'text', text = '', number = 0): NoteLine {
  lineCounter++
  return {
    id: `line_${Date.now()}_${lineCounter}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    text,
    done: false,
    number,
  }
}
 
function migrateOldFormat(n: any): NoteLine[] {
  const lines: NoteLine[] = []
  if (n.content) {
    n.content.split('\n').forEach((part: string) => {
      const numMatch = part.match(/^(\d+)\.\s+(.*)/)
      if (numMatch) {
        lines.push(makeLine('numbered', numMatch[2], parseInt(numMatch[1])))
      } else {
        lines.push(makeLine('text', part))
      }
    })
  }
  if (Array.isArray(n.tasks)) {
    n.tasks.forEach((t: any) => {
      lines.push({ id: t.id || makeLine().id, type: 'task', text: t.text || '', done: t.done || false, number: 0 })
    })
  }
  if (lines.length === 0) lines.push(makeLine())
  return lines
}
 
function makeNote(partial?: Partial<StickyNote>): StickyNote {
  return {
    id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: '',
    lines: [makeLine()],
    color: 'yellow',
    pinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  }
}
 
function loadNotesLS(userId: string): StickyNote[] {
  try {
    const raw = localStorage.getItem(`sticky_notes_${userId}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      return parsed.map((n: any) => ({
        id: n.id,
        title: n.title || '',
        lines: Array.isArray(n.lines) ? n.lines : migrateOldFormat(n),
        color: n.color || 'yellow',
        pinned: n.pinned || false,
        createdAt: n.createdAt || Date.now(),
        updatedAt: n.updatedAt || Date.now(),
      }))
    }
  } catch {}
  return []
}
 
function saveNotesLS(userId: string, notes: StickyNote[]) {
  try {
    localStorage.setItem(`sticky_notes_${userId}`, JSON.stringify(notes))
  } catch {}
}
 
export function StickyNoteWidget() {
  const { user } = useJWTAuth()
  const userId = user?.id || 'guest'
  const [notes, setNotes] = useState<StickyNote[]>(() => loadNotesLS(userId))
  const [activeId, setActiveId] = useState<string | null>(null)
  const [focusedLineId, setFocusedLineId] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadedUserIdRef = useRef<string | null>(null)
  const syncingRef = useRef(false)
  const backendLoadedRef = useRef(false)
  const lineInputRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement>>({})
 
  const syncToBackend = useCallback(async (notesToSync: StickyNote[]) => {
    for (const note of notesToSync) {
      try {
        const body = JSON.stringify({
          title: note.title,
          lines: note.lines,
          color: note.color,
          pinned: note.pinned,
        })
        const res = await apiFetch(`/api/widgets/sticky-notes/${note.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body,
        })
        if (!res.ok) {
          await apiFetch('/api/widgets/sticky-notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: note.id,
              title: note.title,
              lines: note.lines,
              color: note.color,
              pinned: note.pinned,
            }),
          })
        }
      } catch (err) {
        console.error('Failed to sync note to server:', err)
      }
    }
  }, [])
 
  // Load from backend when user changes — merge with local (local wins if newer)
  useEffect(() => {
    if (!user?.id) {
      backendLoadedRef.current = true
      return
    }
    if (loadedUserIdRef.current !== user.id) {
      loadedUserIdRef.current = user.id
      backendLoadedRef.current = false
      ;(async () => {
        try {
          const res = await apiFetch('/api/widgets/sticky-notes')
          if (res.ok) {
            const data = await res.json()
            syncingRef.current = true
            const localNotes = loadNotesLS(user.id)
            const localMap = new Map(localNotes.map((n) => [n.id, n]))
            if (data.notes && data.notes.length > 0) {
              const serverNotes = data.notes.map((n: any) => ({
                id: n.id,
                title: n.title || '',
                lines: Array.isArray(n.lines) ? n.lines : migrateOldFormat(n),
                color: n.color || 'yellow',
                pinned: n.pinned || false,
                createdAt: new Date(n.createdAt).getTime(),
                updatedAt: new Date(n.updatedAt).getTime(),
              }))
              const merged = serverNotes.map((sn) => {
                const ln = localMap.get(sn.id)
                if (ln && ln.updatedAt > sn.updatedAt) return ln
                return sn
              })
              for (const ln of localNotes) {
                if (!merged.find((m) => m.id === ln.id)) merged.push(ln)
              }
              setNotes(merged)
              saveNotesLS(user.id, merged)
            } else {
              setNotes(localNotes.length > 0 ? localNotes : [])
            }
          }
        } catch (err) {
          console.error('Failed to load sticky notes from server:', err)
        } finally {
          backendLoadedRef.current = true
        }
      })()
    }
  }, [user?.id])
 
  // Ensure at least one note exists after backend load
  useEffect(() => {
    if (!backendLoadedRef.current) return
    if (notes.length === 0) {
      const newNote = makeNote()
      setNotes([newNote])
      setActiveId(newNote.id)
    } else if (!activeId) {
      const pinned = notes.find((n) => n.pinned)
      setActiveId(pinned?.id || notes[0].id)
    }
  }, [notes, activeId])
 
  // Debounced save to localStorage + backend
  useEffect(() => {
    if (syncingRef.current) {
      syncingRef.current = false
      return
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveNotesLS(userId, notes)
      if (user?.id) syncToBackend(notes)
    }, 600)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [notes, user?.id, syncToBackend])
 
  const activeNote = notes.find((n) => n.id === activeId) || notes[0]
 
  const updateNote = (id: string, patch: Partial<StickyNote>) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)))
  }
 
  const updateTitle = (title: string) => {
    if (!activeNote) return
    updateNote(activeNote.id, { title })
  }
 
  // Renumber all 'numbered' lines sequentially
  const renumberLines = (lines: NoteLine[]): NoteLine[] => {
    let num = 0
    return lines.map((l) => {
      if (l.type === 'numbered') {
        num++
        return { ...l, number: num }
      }
      // Reset counter when a non-numbered line appears
      if (l.type !== 'numbered') num = 0
      return l
    })
  }
 
  // Update a single line's text, with auto-format detection
  const updateLineText = (lineId: string, text: string) => {
    if (!activeNote) return
    const lines = activeNote.lines.map((l) => {
      if (l.id === lineId) {
        // Auto-format: "1. " + space → numbered, "- [ ] " + space → task
        const numMatch = text.match(/^(\d+)\.\s$/)
        if (numMatch && l.type !== 'numbered') {
          return { ...l, type: 'numbered' as LineType, text: '', number: parseInt(numMatch[1]) }
        }
        const taskMatch = text.match(/^-\s*\[\s*\]\s$/)
        if (taskMatch && l.type !== 'task') {
          return { ...l, type: 'task' as LineType, text: '' }
        }
        return { ...l, text }
      }
      return l
    })
    const renumbered = renumberLines(lines)
    updateNote(activeNote.id, { lines: renumbered })
  }
 
  const toggleLineDone = (lineId: string) => {
    if (!activeNote) return
    const lines = activeNote.lines.map((l) =>
      l.id === lineId ? { ...l, done: !l.done } : l
    )
    updateNote(activeNote.id, { lines })
  }
 
  // Add a new line after the given lineId (or at end if null)
  const addLineAfter = (lineId: string | null) => {
    if (!activeNote) return
    const lines = [...activeNote.lines]
    let newLine: NoteLine
    if (lineId) {
      const idx = lines.findIndex((l) => l.id === lineId)
      const current = lines[idx]
      // If current line is numbered, continue numbering
      if (current.type === 'numbered') {
        newLine = makeLine('numbered', '', current.number + 1)
      } else if (current.type === 'task') {
        newLine = makeLine('task')
      } else {
        newLine = makeLine('text')
      }
      lines.splice(idx + 1, 0, newLine)
    } else {
      newLine = makeLine('text')
      lines.push(newLine)
    }
    const renumbered = renumberLines(lines)
    updateNote(activeNote.id, { lines: renumbered })
    // Focus the new line after render
    setTimeout(() => {
      const el = lineInputRefs.current[newLine.id]
      if (el) el.focus()
    }, 0)
  }
 
  // Delete a line, optionally merge text with previous
  const deleteLine = (lineId: string, mergeWithPrev: boolean) => {
    if (!activeNote) return
    const lines = [...activeNote.lines]
    const idx = lines.findIndex((l) => l.id === lineId)
    if (idx === -1) return
    if (lines.length === 1) return // keep at least one line
 
    if (mergeWithPrev && idx > 0) {
      const prev = lines[idx - 1]
      const current = lines[idx]
      const cursorPos = prev.text.length
      prev.text = prev.text + current.text
      lines.splice(idx, 1)
      const renumbered = renumberLines(lines)
      updateNote(activeNote.id, { lines: renumbered })
      setTimeout(() => {
        const el = lineInputRefs.current[prev.id]
        if (el && 'setSelectionRange' in el) {
          el.focus()
          el.setSelectionRange(cursorPos, cursorPos)
        }
      }, 0)
    } else {
      lines.splice(idx, 1)
      const renumbered = renumberLines(lines)
      updateNote(activeNote.id, { lines: renumbered })
      // Focus previous line
      const focusIdx = Math.max(0, idx - 1)
      setTimeout(() => {
        const el = lineInputRefs.current[lines[focusIdx]?.id]
        if (el) el.focus()
      }, 0)
    }
  }
 
  // Change line type via toolbar
  const changeLineType = (lineId: string, type: LineType) => {
    if (!activeNote) return
    const lines = activeNote.lines.map((l) =>
      l.id === lineId ? { ...l, type, done: type === 'task' ? l.done : false } : l
    )
    const renumbered = renumberLines(lines)
    updateNote(activeNote.id, { lines: renumbered })
  }

  const addNote = () => {
    const colors = ['yellow', 'pink', 'blue', 'green', 'orange', 'purple']
    const newNote = makeNote({ color: colors[notes.length % colors.length] })
    setNotes((prev) => [...prev, newNote])
    setActiveId(newNote.id)
  }

  const deleteNote = (id: string) => {
    setNotes((prev) => {
      const filtered = prev.filter((n) => n.id !== id)
      if (filtered.length === 0) {
        const newNote = makeNote()
        setActiveId(newNote.id)
        return [newNote]
      }
      if (id === activeId) setActiveId(filtered[0].id)
      return filtered
    })
    if (user?.id) {
      apiFetch(`/api/widgets/sticky-notes/${id}`, { method: 'DELETE' }).catch(() => {})
    }
  }

  const changeColor = (color: string) => {
    if (!activeNote) return
    updateNote(activeNote.id, { color })
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

  const doneCount = activeNote?.lines.filter((l) => l.type === 'task' && l.done).length || 0
  const totalTaskCount = activeNote?.lines.filter((l) => l.type === 'task').length || 0
  const charCount = activeNote?.lines.reduce((sum, l) => sum + l.text.length, 0) || 0

  // Auto-resize all line textareas when activeNote changes
  useEffect(() => {
    if (!activeNote) return
    for (const line of activeNote.lines) {
      const el = lineInputRefs.current[line.id]
      if (el && 'scrollHeight' in el) {
        el.style.height = 'auto'
        el.style.height = el.scrollHeight + 'px'
      }
    }
  }, [activeNote?.id, activeNote?.lines])

  // Handle keydown for line inputs
  const handleLineKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, line: NoteLine) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      addLineAfter(line.id)
    } else if (e.key === 'Backspace') {
      const el = e.currentTarget
      if (el.selectionStart === 0 && el.selectionEnd === 0) {
        e.preventDefault()
        deleteLine(line.id, true)
      }
    }
  }

  const noteLabel = (n: StickyNote): string => {
    if (n.title) return n.title
    const firstText = n.lines.find((l) => l.text.trim())
    if (firstText) return firstText.text.slice(0, 16)
    return 'Untitled'
  }

  return (
    <div className="flex flex-col h-full" style={{ background: colorObj.bg }}>
      {/* Note tabs */}
      {sortedNotes.length > 1 && (
        <div className="flex gap-1 px-2 pt-2 pb-1 overflow-x-auto no-drag" style={{ background: colorObj.bg }}>
          {sortedNotes.map((n) => {
            const nc = COLORS.find((c) => c.name === n.color) || COLORS[0]
            const label = noteLabel(n)
            const tasks = n.lines.filter((l) => l.type === 'task')
            const suffix = tasks.length > 0 ? ` (${tasks.filter((t) => t.done).length}/${tasks.length})` : ''
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
                {label}{suffix}
              </button>
            )
          })}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 no-drag flex-wrap" style={{ background: colorObj.bg }}>
        <button onClick={addNote} className="p-1 rounded hover:bg-black/10 transition-colors" style={{ color: colorObj.accent }} title="New note">
          <Plus className="h-4 w-4" />
        </button>
        <button onClick={() => activeNote && togglePin(activeNote.id)} className="p-1 rounded hover:bg-black/10 transition-colors" style={{ color: colorObj.accent }} title={activeNote?.pinned ? 'Unpin' : 'Pin'}>
          {activeNote?.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        </button>
        <button onClick={() => activeNote && deleteNote(activeNote.id)} className="p-1 rounded hover:bg-black/10 transition-colors" style={{ color: colorObj.accent }} title="Delete note">
          <Trash2 className="h-4 w-4" />
        </button>

        {/* Line type buttons — apply to focused line */}
        <div className="flex gap-0.5 ml-1 border-l border-black/10 pl-1">
          <button
            onClick={() => focusedLineId && changeLineType(focusedLineId, 'text')}
            className="p-1 rounded transition-colors hover:bg-black/10"
            style={{ color: colorObj.accent }}
            title="Plain text line"
          >
            <span className="text-sm font-bold">¶</span>
          </button>
          <button
            onClick={() => focusedLineId && changeLineType(focusedLineId, 'numbered')}
            className="p-1 rounded transition-colors hover:bg-black/10"
            style={{ color: colorObj.accent }}
            title="Numbered list"
          >
            <span className="text-sm font-bold">#</span>
          </button>
          <button
            onClick={() => focusedLineId && changeLineType(focusedLineId, 'task')}
            className="p-1 rounded transition-colors hover:bg-black/10"
            style={{ color: colorObj.accent }}
            title="Task checkbox"
          >
            <span className="text-sm font-bold">☑</span>
          </button>
        </div>

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

      {/* Title input */}
      <div className="px-3 pt-1 pb-0 no-drag" style={{ background: colorObj.bg }}>
        <input
          type="text"
          value={activeNote?.title || ''}
          onChange={(e) => updateTitle(e.target.value)}
          placeholder="Title"
          className="w-full bg-transparent outline-none border-none font-bold"
          style={{
            color: '#1c1917',
            fontFamily: "'Caveat', cursive",
            fontSize: '22px',
            fontWeight: 700,
          }}
        />
      </div>

      {/* Unified line editor */}
      <div className="flex-1 overflow-auto p-3 pt-1 no-drag space-y-0.5" style={{ background: colorObj.bg }}>
        {activeNote?.lines.map((line) => (
          <div key={line.id} className="flex items-start gap-2 group">
            {/* Line prefix based on type */}
            {line.type === 'numbered' && (
              <span
                className="shrink-0 select-none mt-0.5"
                style={{ color: colorObj.accent, fontFamily: "'Caveat', cursive", fontSize: '20px', minWidth: '1.5em', textAlign: 'right' }}
              >
                {line.number}.
              </span>
            )}
            {line.type === 'task' && (
              <button
                onClick={() => toggleLineDone(line.id)}
                className={`mt-0.5 shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  line.done ? 'bg-green-500 border-green-500' : 'border-gray-400 hover:border-gray-600'
                }`}
                style={{ borderColor: line.done ? '#22c55e' : colorObj.accent + '88' }}
              >
                {line.done && (
                  <svg viewBox="0 0 20 20" fill="white" className="w-3 h-3">
                    <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42l2.79 2.79 6.79-6.79a1 1 0 011.42 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            )}
            {line.type === 'text' && (
              <span className="shrink-0 w-1" />
            )}

            {/* Text input — textarea for wrapping */}
            <textarea
              ref={(el) => { if (el) lineInputRefs.current[line.id] = el }}
              onFocus={(e) => {
                setFocusedLineId(line.id)
                // Keep cursor visible in the scrollable container
                const container = e.currentTarget.closest('.overflow-auto')
                if (container) {
                  const ta = e.currentTarget
                  const taRect = ta.getBoundingClientRect()
                  const cRect = container.getBoundingClientRect()
                  if (taRect.bottom > cRect.bottom) {
                    container.scrollTop += taRect.bottom - cRect.bottom + 4
                  } else if (taRect.top < cRect.top) {
                    container.scrollTop -= cRect.top - taRect.top + 4
                  }
                }
              }}
              value={line.text}
              onChange={(e) => updateLineText(line.id, e.target.value)}
              onKeyDown={(e) => handleLineKeyDown(e, line)}
              onInput={(e) => {
                const ta = e.currentTarget
                ta.style.height = 'auto'
                ta.style.height = ta.scrollHeight + 'px'
                // Keep cursor in view as the textarea grows
                const container = ta.closest('.overflow-auto')
                if (container) {
                  const taRect = ta.getBoundingClientRect()
                  const cRect = container.getBoundingClientRect()
                  if (taRect.bottom > cRect.bottom) {
                    container.scrollTop += taRect.bottom - cRect.bottom + 4
                  }
                }
              }}
              rows={1}
              placeholder={line.type === 'task' ? 'Type a task...' : line.type === 'numbered' ? 'Type a numbered item...' : 'Write something... or type "1. " for a list, "- [ ] " for a task'}
              className="flex-1 min-w-0 bg-transparent outline-none border-none resize-none overflow-hidden"
              style={{
                color: '#1c1917',
                fontFamily: "'Caveat', cursive",
                fontSize: '20px',
                lineHeight: '1.4',
                textDecoration: line.type === 'task' && line.done ? 'line-through' : 'none',
                opacity: line.type === 'task' && line.done ? 0.5 : 1,
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                width: '100%',
              }}
            />

            {/* Delete line button — visible on hover */}
            <button
              onClick={() => deleteLine(line.id, false)}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/10 transition-opacity shrink-0"
              style={{ color: colorObj.accent }}
              title="Delete line"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {/* Add new line button */}
        <button
          onClick={() => addLineAfter(null)}
          className="flex items-center gap-1 text-sm pt-1 transition-colors hover:opacity-100 opacity-50"
          style={{ color: colorObj.accent, fontFamily: "'Caveat', cursive", fontSize: '18px' }}
        >
          <Plus className="h-4 w-4" /> Add line
        </button>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1 text-[10px] no-drag" style={{ color: colorObj.accent, background: colorObj.bg }}>
        <span>
          {charCount} chars{totalTaskCount > 0 ? ` · ${doneCount}/${totalTaskCount} tasks` : ''}
        </span>
        <span>{notes.length} note{notes.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  )
}