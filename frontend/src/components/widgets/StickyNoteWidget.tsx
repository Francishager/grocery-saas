import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, Trash2, Pin, PinOff, ListOrdered, CheckSquare, FileText } from 'lucide-react'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { apiFetch } from '@/lib/api'

type NoteMode = 'plain' | 'numbered' | 'tasks'

interface TaskItem {
  id: string
  text: string
  done: boolean
}

interface StickyNote {
  id: string
  title: string
  content: string
  mode: NoteMode
  tasks: TaskItem[]
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

function loadNotesLS(userId: string): StickyNote[] {
  try {
    const raw = localStorage.getItem(`sticky_notes_${userId}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      return parsed.map((n: any) => ({
        ...n,
        title: n.title || '',
        mode: n.mode || 'plain',
        tasks: n.tasks || [],
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

function makeNote(partial?: Partial<StickyNote>): StickyNote {
  return {
    id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: '',
    content: '',
    mode: 'plain',
    tasks: [],
    color: 'yellow',
    pinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  }
}

export function StickyNoteWidget() {
  const { user } = useJWTAuth()
  const userId = user?.id || 'guest'
  const [notes, setNotes] = useState<StickyNote[]>(() => loadNotesLS(userId))
  const [activeId, setActiveId] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const loadedUserIdRef = useRef<string | null>(null)
  const syncingRef = useRef(false)
  const backendLoadedRef = useRef(false)

  // Load notes from backend when user changes
  // Always fetch from backend (cross-device sync), merge with local (local wins if newer)
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
                content: n.content || '',
                mode: n.mode || 'plain',
                tasks: Array.isArray(n.tasks) ? n.tasks : [],
                color: n.color || 'yellow',
                pinned: n.pinned || false,
                createdAt: new Date(n.createdAt).getTime(),
                updatedAt: new Date(n.updatedAt).getTime(),
              }))
              // Merge: server notes, override with local if local is newer
              const merged = serverNotes.map((sn) => {
                const ln = localMap.get(sn.id)
                if (ln && ln.updatedAt > sn.updatedAt) return ln
                return sn
              })
              // Add local-only notes (created offline, not on server yet)
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

  // Ensure at least one note exists — but only after backend load is done
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
      // Sync to backend (only if user is authenticated)
      if (user?.id) {
        syncToBackend(notes)
      }
    }, 600)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [notes, user?.id])

  // Backend sync: upsert each note
  const syncToBackend = useCallback(async (notesToSync: StickyNote[]) => {
    for (const note of notesToSync) {
      try {
        const res = await apiFetch(`/api/widgets/sticky-notes/${note.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: note.title,
            content: note.content,
            mode: note.mode,
            tasks: note.tasks,
            color: note.color,
            pinned: note.pinned,
          }),
        })
        if (!res.ok) {
          // Note doesn't exist on server yet — create it
          await apiFetch('/api/widgets/sticky-notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: note.id,
              title: note.title,
              content: note.content,
              mode: note.mode,
              tasks: note.tasks,
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

  const activeNote = notes.find((n) => n.id === activeId) || notes[0]

  const updateNote = (id: string, patch: Partial<StickyNote>) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)))
  }

  const updateContent = (content: string) => {
    if (!activeNote) return
    updateNote(activeNote.id, { content })
  }

  const updateTitle = (title: string) => {
    if (!activeNote) return
    updateNote(activeNote.id, { title })
  }

  // Auto-numbering: handle Enter key in numbered mode
  const handleNumberedKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const ta = e.currentTarget
      const cursorPos = ta.selectionStart
      const text = ta.value
      const beforeCursor = text.substring(0, cursorPos)
      const lineStart = beforeCursor.lastIndexOf('\n') + 1
      const currentLine = beforeCursor.substring(lineStart)

      // Match patterns like "1. ", "2. ", "10. ", etc.
      const numMatch = currentLine.match(/^(\d+)\.\s+/)
      if (numMatch) {
        const nextNum = parseInt(numMatch[1]) + 1
        const afterCursor = text.substring(cursorPos)
        const newText = text.substring(0, cursorPos) + `\n${nextNum}. ` + afterCursor
        updateContent(newText)
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            const newPos = cursorPos + `\n${nextNum}. `.length
            textareaRef.current.setSelectionRange(newPos, newPos)
          }
        })
        return
      }

      // If no number on current line, check if previous line had a number
      const lines = beforeCursor.split('\n')
      if (lines.length >= 2) {
        const prevLine = lines[lines.length - 2]
        const prevMatch = prevLine.match(/^(\d+)\.\s+/)
        if (prevMatch) {
          const nextNum = parseInt(prevMatch[1]) + 1
          const afterCursor = text.substring(cursorPos)
          const newText = text.substring(0, cursorPos) + `\n${nextNum}. ` + afterCursor
          updateContent(newText)
          requestAnimationFrame(() => {
            if (textareaRef.current) {
              const newPos = cursorPos + `\n${nextNum}. `.length
              textareaRef.current.setSelectionRange(newPos, newPos)
            }
          })
          return
        }
      }

      // Default: just insert newline
      const afterCursor = text.substring(cursorPos)
      updateContent(text.substring(0, cursorPos) + '\n' + afterCursor)
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const newPos = cursorPos + 1
          textareaRef.current.setSelectionRange(newPos, newPos)
        }
      })
    }
  }

  // Task operations
  const addTask = () => {
    if (!activeNote) return
    const newTask: TaskItem = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: '',
      done: false,
    }
    updateNote(activeNote.id, { tasks: [...activeNote.tasks, newTask] })
  }

  const updateTaskText = (taskId: string, text: string) => {
    if (!activeNote) return
    updateNote(activeNote.id, {
      tasks: activeNote.tasks.map((t) => (t.id === taskId ? { ...t, text } : t)),
    })
  }

  const toggleTask = (taskId: string) => {
    if (!activeNote) return
    updateNote(activeNote.id, {
      tasks: activeNote.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)),
    })
  }

  const deleteTask = (taskId: string) => {
    if (!activeNote) return
    updateNote(activeNote.id, {
      tasks: activeNote.tasks.filter((t) => t.id !== taskId),
    })
  }

  const handleTaskKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, taskId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTask()
      requestAnimationFrame(() => {
        const container = e.currentTarget.closest('.space-y-1')
        if (container) {
          const inputs = container.querySelectorAll('input[type="text"]')
          if (inputs && inputs.length > 0) {
            ;(inputs[inputs.length - 1] as HTMLInputElement).focus()
          }
        }
      })
    } else if (e.key === 'Backspace' && activeNote) {
      const task = activeNote.tasks.find((t) => t.id === taskId)
      if (task && task.text === '' && activeNote.tasks.length > 1) {
        e.preventDefault()
        deleteTask(taskId)
      }
    }
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
    // Delete from backend
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

  const changeMode = (mode: NoteMode) => {
    if (!activeNote) return
    if (mode === 'tasks' && activeNote.tasks.length === 0) {
      updateNote(activeNote.id, {
        mode,
        tasks: [{ id: `task_${Date.now()}`, text: '', done: false }],
      })
    } else {
      updateNote(activeNote.id, { mode })
    }
  }

  const colorObj = COLORS.find((c) => c.name === activeNote?.color) || COLORS[0]
  const sortedNotes = [...notes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return b.updatedAt - a.updatedAt
  })

  const doneCount = activeNote?.tasks.filter((t) => t.done).length || 0
  const totalCount = activeNote?.tasks.length || 0

  return (
    <div className="flex flex-col h-full" style={{ background: colorObj.bg }}>
      {/* Note tabs */}
      {sortedNotes.length > 1 && (
        <div className="flex gap-1 px-2 pt-2 pb-1 overflow-x-auto no-drag" style={{ background: colorObj.bg }}>
          {sortedNotes.map((n) => {
            const nc = COLORS.find((c) => c.name === n.color) || COLORS[0]
            const label = n.title || (n.mode === 'tasks'
              ? `${n.tasks.filter(t => t.done).length}/${n.tasks.length} done`
              : (n.content.slice(0, 12) || 'Untitled'))
            const showEllipsis = !n.title && n.content.length > 12
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
                {label}
                {showEllipsis ? '…' : ''}
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

        {/* Mode switcher */}
        <div className="flex gap-0.5 ml-1 border-l border-black/10 pl-1">
          <button
            onClick={() => changeMode('plain')}
            className={`p-1 rounded transition-colors ${activeNote?.mode === 'plain' ? 'bg-black/15' : 'hover:bg-black/10'}`}
            style={{ color: colorObj.accent }}
            title="Plain text"
          >
            <FileText className="h-4 w-4" />
          </button>
          <button
            onClick={() => changeMode('numbered')}
            className={`p-1 rounded transition-colors ${activeNote?.mode === 'numbered' ? 'bg-black/15' : 'hover:bg-black/10'}`}
            style={{ color: colorObj.accent }}
            title="Numbered list (auto-number on Enter)"
          >
            <ListOrdered className="h-4 w-4" />
          </button>
          <button
            onClick={() => changeMode('tasks')}
            className={`p-1 rounded transition-colors ${activeNote?.mode === 'tasks' ? 'bg-black/15' : 'hover:bg-black/10'}`}
            style={{ color: colorObj.accent }}
            title="Task list with checkboxes"
          >
            <CheckSquare className="h-4 w-4" />
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

      {/* Note content — textarea always visible */}
      <textarea
        ref={textareaRef}
        value={activeNote?.content || ''}
        onChange={(e) => updateContent(e.target.value)}
        onKeyDown={activeNote?.mode === 'numbered' ? handleNumberedKeyDown : undefined}
        placeholder={activeNote?.mode === 'numbered' ? 'Type "1. " to start a numbered list...\nPress Enter for next number' : 'Write something...'}
        className="w-full p-4 resize-none outline-none border-none no-drag"
        style={{
          background: colorObj.bg,
          color: '#1c1917',
          fontFamily: "'Caveat', cursive",
          fontSize: '20px',
          lineHeight: '1.5',
          boxShadow: 'inset 0 0 20px rgba(0,0,0,0.03)',
          minHeight: '60px',
          flex: activeNote?.mode === 'tasks' ? '0 0 auto' : '1',
        }}
        autoFocus
      />

      {/* Task list — shown below content when in tasks mode */}
      {activeNote?.mode === 'tasks' && (
        <div className="flex-1 overflow-auto p-3 pt-0 no-drag space-y-1" style={{ background: colorObj.bg }}>
          {activeNote.tasks.map((task) => (
            <div key={task.id} className="flex items-start gap-2 group">
              <button
                onClick={() => toggleTask(task.id)}
                className={`mt-0.5 shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  task.done ? 'bg-green-500 border-green-500' : 'border-gray-400 hover:border-gray-600'
                }`}
                style={{ borderColor: task.done ? '#22c55e' : colorObj.accent + '88' }}
              >
                {task.done && (
                  <svg viewBox="0 0 20 20" fill="white" className="w-3 h-3">
                    <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42l2.79 2.79 6.79-6.79a1 1 0 011.42 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
              <input
                type="text"
                value={task.text}
                onChange={(e) => updateTaskText(task.id, e.target.value)}
                onKeyDown={(e) => handleTaskKeyDown(e, task.id)}
                placeholder="Type a task..."
                className="flex-1 min-w-0 bg-transparent outline-none border-none overflow-hidden"
                style={{
                  color: '#1c1917',
                  fontFamily: "'Caveat', cursive",
                  fontSize: '20px',
                  lineHeight: '1.4',
                  textDecoration: task.done ? 'line-through' : 'none',
                  opacity: task.done ? 0.5 : 1,
                }}
              />
              <button
                onClick={() => deleteTask(task.id)}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/10 transition-all shrink-0"
                style={{ color: colorObj.accent }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={addTask}
            className="flex items-center gap-1 text-sm pt-1 transition-colors hover:opacity-100 opacity-50"
            style={{ color: colorObj.accent, fontFamily: "'Caveat', cursive", fontSize: '18px' }}
          >
            <Plus className="h-4 w-4" /> Add task
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1 text-[10px] no-drag" style={{ color: colorObj.accent, background: colorObj.bg }}>
        <span>
          {activeNote?.mode === 'tasks'
            ? `${activeNote?.content.length || 0} chars · ${doneCount}/${totalCount} tasks`
            : `${activeNote?.content.length || 0} chars`}
        </span>
        <span>{notes.length} note{notes.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  )
}
