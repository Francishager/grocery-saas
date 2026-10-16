import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, MessageCircle, Plus, Search, Send, UsersRound, X } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useFeatureAccess } from '@/services/featureAccessService'
import { cn } from '@/lib/utils'

type Person = { id: string; name: string; role: string; avatar?: string | null }
type Message = { id: string; senderId: string; recipientId: string; body: string; readAt: string | null; createdAt: string }
type Conversation = { id: string; participant: Person; latestMessage: Message | null; latestUnread?: Message | null; unreadCount: number; updatedAt: string }
type LauncherPosition = { x: number; y: number }
const LAUNCHER_SIZE = 48
const LAUNCHER_MARGIN = 12
const LAUNCHER_POSITION_KEY = 'business-chat-launcher-position'

function clampLauncherPosition(position: LauncherPosition): LauncherPosition {
  return {
    x: Math.max(LAUNCHER_MARGIN, Math.min(position.x, window.innerWidth - LAUNCHER_SIZE - LAUNCHER_MARGIN)),
    y: Math.max(LAUNCHER_MARGIN, Math.min(position.y, window.innerHeight - LAUNCHER_SIZE - LAUNCHER_MARGIN)),
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`/api/messages${path}`, {
    ...init,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error || 'Business messages are unavailable.')
  return payload as T
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U'
}

function conversationTime(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const today = new Date()
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

export function BusinessChatWidget() {
  const { user, hasPermission } = useJWTAuth()
  const { canAccessFeature } = useFeatureAccess()
  const enabled = Boolean(user && canAccessFeature('communication.team_messaging'))
  const canView = user?.role === 'owner' || hasPermission('canViewTeamMessaging')
  const canSend = canView && (user?.role === 'owner' || hasPermission('canSendTeamMessages'))
  const [open, setOpen] = useState(false)
  const [newMessageMode, setNewMessageMode] = useState(false)
  const [people, setPeople] = useState<Person[]>([])
  const [peopleSearch, setPeopleSearch] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [incoming, setIncoming] = useState<{ conversation: Conversation; message: Message } | null>(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [launcherPosition, setLauncherPosition] = useState<LauncherPosition | null>(null)
  const seenMessages = useRef<Set<string> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const launcherDrag = useRef<{ pointerId: number; offsetX: number; offsetY: number; startX: number; startY: number; moved: boolean } | null>(null)
  const suppressLauncherClick = useRef(false)

  useEffect(() => {
    const fallback = { x: window.innerWidth - LAUNCHER_SIZE - 16, y: window.innerHeight - LAUNCHER_SIZE - 16 }
    try {
      const saved = localStorage.getItem(LAUNCHER_POSITION_KEY)
      const parsed = saved ? JSON.parse(saved) : null
      setLauncherPosition(clampLauncherPosition(parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y) ? parsed : fallback))
    } catch {
      setLauncherPosition(clampLauncherPosition(fallback))
    }
    const handleResize = () => setLauncherPosition((position) => position ? clampLauncherPosition(position) : null)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!launcherPosition) return
    try { localStorage.setItem(LAUNCHER_POSITION_KEY, JSON.stringify(launcherPosition)) } catch { /* Position persistence is optional. */ }
  }, [launcherPosition])

  const refreshConversations = useCallback(async () => {
    if (!enabled || !canView) return
    try {
      const { conversations: rows } = await api<{ conversations: Conversation[] }>('/conversations')
      const firstLoad = seenMessages.current === null
      const fresh = rows
        .map((conversation) => ({ conversation, message: conversation.latestUnread || conversation.latestMessage }))
        .filter((item): item is { conversation: Conversation; message: Message } => Boolean(
          item.message && item.message.senderId !== user?.id &&
          (firstLoad ? item.conversation.unreadCount > 0 : !seenMessages.current?.has(item.message.id)),
        ))
        .sort((a, b) => new Date(b.message.createdAt).getTime() - new Date(a.message.createdAt).getTime())[0]
      if (fresh) setIncoming(fresh)
      seenMessages.current = new Set(rows.flatMap((row) => [row.latestMessage?.id, row.latestUnread?.id]).filter((id): id is string => Boolean(id)))
      setConversations(rows)
    } catch { /* Keep the current inbox usable during short network interruptions. */ }
  }, [enabled, canView, user?.id])

  useEffect(() => {
    if (!enabled || !canView) return
    seenMessages.current = null
    void refreshConversations()
    const timer = window.setInterval(() => void refreshConversations(), 5000)
    return () => window.clearInterval(timer)
  }, [enabled, canView, refreshConversations])

  const loadMessages = useCallback(async (conversation: Conversation) => {
    try {
      const { messages: rows } = await api<{ messages: Message[] }>(`/conversations/${conversation.id}/messages`)
      setMessages(rows)
      setConversations((current) => current.map((row) => row.id === conversation.id ? { ...row, unreadCount: 0 } : row))
      setSelected(conversation)
      setIncoming((current) => current?.conversation.id === conversation.id ? null : current)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not open this conversation.')
    }
  }, [])

  useEffect(() => {
    if (!open || !selected) return
    const timer = window.setInterval(() => {
      void api<{ messages: Message[] }>(`/conversations/${selected.id}/messages`)
        .then(({ messages: rows }) => setMessages(rows))
        .catch(() => {})
    }, 5000)
    return () => window.clearInterval(timer)
  }, [open, selected?.id])

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages])

  const unread = useMemo(() => conversations.reduce((total, row) => total + row.unreadCount, 0), [conversations])
  const filteredPeople = useMemo(() => people.filter((person) => person.name.toLowerCase().includes(peopleSearch.toLowerCase())), [people, peopleSearch])

  async function startConversation(person: Person) {
    try {
      const { conversation } = await api<{ conversation: Conversation }>('/conversations', { method: 'POST', body: JSON.stringify({ recipientId: person.id }) })
      const row: Conversation = { ...conversation, latestMessage: null, unreadCount: 0 }
      setConversations((current) => [row, ...current.filter((item) => item.id !== row.id)])
      setNewMessageMode(false)
      setPeopleSearch('')
      await loadMessages(row)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not start a conversation.') }
  }

  async function openNewMessage() {
    setError('')
    setNewMessageMode(true)
    setSelected(null)
    setPeopleSearch('')
    try {
      const { people: rows } = await api<{ people: Person[] }>('/people')
      setPeople(rows)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load team members.') }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault()
    if (!selected || !draft.trim() || !canSend) return
    setSending(true)
    setError('')
    try {
      const { message } = await api<{ message: Message }>(`/conversations/${selected.id}/messages`, { method: 'POST', body: JSON.stringify({ body: draft.trim() }) })
      setMessages((current) => [...current, message])
      setDraft('')
      await refreshConversations()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Message could not be sent.') }
    finally { setSending(false) }
  }

  function moveLauncher(x: number, y: number) {
    setLauncherPosition(clampLauncherPosition({ x, y }))
  }

  function onLauncherPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!launcherPosition || event.button !== 0) return
    launcherDrag.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - launcherPosition.x,
      offsetY: event.clientY - launcherPosition.y,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onLauncherPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = launcherDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) > 6) drag.moved = true
    if (drag.moved) moveLauncher(event.clientX - drag.offsetX, event.clientY - drag.offsetY)
  }

  function onLauncherPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const drag = launcherDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    suppressLauncherClick.current = drag.moved
    launcherDrag.current = null
  }

  function onLauncherKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 48 : 16
    const deltas: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const delta = deltas[event.key]
    if (!delta || !launcherPosition) return
    event.preventDefault()
    moveLauncher(launcherPosition.x + delta[0], launcherPosition.y + delta[1])
  }

  if (!enabled) return null

  return createPortal(<>
    {incoming && !open && <div role="status" className="fixed bottom-[5.25rem] right-4 z-[80] w-[min(22rem,calc(100vw-2rem))] border bg-card p-3 shadow-xl sm:bottom-20">
      <div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-900">{initials(incoming.conversation.participant.name)}</div><button className="min-w-0 flex-1 text-left" onClick={() => { setOpen(true); void loadMessages(incoming.conversation) }}><span className="block text-xs font-semibold">{incoming.conversation.participant.name} sent a message</span><span className="mt-1 block truncate text-sm text-muted-foreground">{incoming.message.body}</span></button><button type="button" aria-label="Dismiss message popup" onClick={() => setIncoming(null)} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="size-4" /></button></div>
    </div>}

    {open && <section aria-label="Business messages" className="fixed inset-0 z-[79] flex flex-col overflow-hidden bg-background sm:inset-x-auto sm:bottom-20 sm:right-4 sm:top-auto sm:h-[min(680px,calc(100dvh-6rem))] sm:w-[min(420px,calc(100vw-2rem))] sm:border sm:shadow-2xl">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-card px-4">
        {selected ? <button type="button" aria-label="Back to chats" onClick={() => { setSelected(null); setMessages([]); setNewMessageMode(false) }} className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-muted"><ArrowLeft className="size-5" /></button> : <div className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-900"><MessageCircle className="size-5" /></div>}
        {selected && <div className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-900">{initials(selected.participant.name)}</div>}
        <div className="min-w-0 flex-1"><h2 className="truncate text-base font-semibold">{selected?.participant.name || (newMessageMode ? 'New chat' : 'Chats')}</h2><p className="truncate text-xs capitalize text-muted-foreground">{selected ? selected.participant.role.replace(/_/g, ' ') : 'Private business team messaging'}</p></div>
        {!selected && canSend && <button type="button" aria-label="Choose a contact" title="New chat" onClick={() => newMessageMode ? setNewMessageMode(false) : void openNewMessage()} className="grid size-10 shrink-0 place-items-center rounded-full text-emerald-800 hover:bg-emerald-50"><UsersRound className="size-5" /></button>}
        <button type="button" aria-label="Close messages" onClick={() => setOpen(false)} className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
      </header>
      {!canView ? <div className="m-auto max-w-sm px-6 text-center"><UsersRound className="mx-auto size-9 text-muted-foreground/50" /><p className="mt-3 text-sm font-semibold">Team Messaging access needed</p><p className="mt-1 text-sm text-muted-foreground">Ask your business admin to grant the “View Team Messaging” permission. Sending messages also requires “Send Team Messages”.</p></div> : selected ? <>
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#efeae2] px-3 py-4 sm:px-4">{messages.map((message) => { const own = message.senderId === user?.id; return <div key={message.id} className={cn('max-w-[88%] px-3 py-2 shadow-sm sm:max-w-[82%]', own ? 'ml-auto rounded-2xl rounded-br-sm bg-[#d9fdd3]' : 'rounded-2xl rounded-bl-sm bg-white')}><p className="whitespace-pre-wrap break-words text-sm leading-5 text-[#17211b]">{message.body}</p><time className="mt-1 block text-right text-[10px] tabular-nums text-[#667781]">{conversationTime(message.createdAt)}</time></div> })}</div>
        {canSend ? <form onSubmit={sendMessage} className="flex shrink-0 items-end gap-2 border-t bg-card p-3"><textarea aria-label="Message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} maxLength={4000} rows={1} placeholder="Message" className="max-h-28 min-h-10 min-w-0 flex-1 resize-y rounded-2xl border bg-background px-4 py-2.5 text-sm" /><button type="submit" aria-label="Send message" disabled={!draft.trim() || sending} className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-800 text-white disabled:opacity-50"><Send className="size-4" /></button></form> : <p className="border-t bg-card px-4 py-3 text-xs text-muted-foreground">You can read messages but do not have permission to send them.</p>}
      </> : <>
        <div className="shrink-0 border-b p-3"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input aria-label={newMessageMode ? 'Search contacts' : 'Search conversations'} value={peopleSearch} onChange={(event) => setPeopleSearch(event.target.value)} placeholder={newMessageMode ? 'Search contacts' : 'Search chats'} className="h-10 w-full rounded-full border-0 bg-muted/70 pl-10 pr-4 text-sm" /></div></div>
        <div className="min-h-0 flex-1 overflow-y-auto">{newMessageMode ? filteredPeople.map((person) => <button key={person.id} type="button" onClick={() => void startConversation(person)} className="flex w-full items-center gap-3 border-b px-4 py-3 text-left hover:bg-muted/50"><div className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-900">{initials(person.name)}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{person.name}</p><p className="text-xs capitalize text-muted-foreground">{person.role.replace(/_/g, ' ')}</p></div></button>) : [...conversations].filter((conversation) => !peopleSearch || conversation.participant.name.toLowerCase().includes(peopleSearch.toLowerCase())).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).map((conversation) => <button key={conversation.id} type="button" onClick={() => void loadMessages(conversation)} className="flex w-full items-center gap-3 border-b px-4 py-3 text-left hover:bg-muted/50"><div className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-900">{initials(conversation.participant.name)}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{conversation.participant.name}</p><time className={cn('shrink-0 text-[11px]', conversation.unreadCount ? 'font-medium text-emerald-800' : 'text-muted-foreground')}>{conversationTime(conversation.latestMessage?.createdAt || conversation.updatedAt)}</time></div><div className="mt-1 flex items-center justify-between gap-2"><p className={cn('truncate text-xs', conversation.unreadCount ? 'font-medium text-foreground' : 'text-muted-foreground')}>{conversation.latestMessage?.body || 'Start a conversation'}</p>{conversation.unreadCount > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-emerald-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">{conversation.unreadCount}</span>}</div></div></button>)}
          {!newMessageMode && conversations.length === 0 && <div className="px-6 py-12 text-center"><MessageCircle className="mx-auto size-9 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">No chats yet</p><p className="mt-1 text-xs text-muted-foreground">Start a private conversation with a teammate.</p>{canSend && <button type="button" onClick={() => void openNewMessage()} className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-800 px-4 py-2 text-sm font-medium text-white"><Plus className="size-4" />New chat</button>}</div>}
          {newMessageMode && filteredPeople.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted-foreground">No active team members found.</p>}
        </div>
      </>}
      {error && <div role="alert" className="shrink-0 border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}
    </section>}

    {launcherPosition && <button
      type="button"
      onPointerDown={onLauncherPointerDown}
      onPointerMove={onLauncherPointerMove}
      onPointerUp={onLauncherPointerUp}
      onPointerCancel={onLauncherPointerUp}
      onClick={() => {
        if (suppressLauncherClick.current) { suppressLauncherClick.current = false; return }
        setOpen((current) => !current)
        setIncoming(null)
      }}
      onKeyDown={onLauncherKeyDown}
      aria-label={`${open ? 'Close' : 'Open'} business messages${unread ? `, ${unread} unread` : ''}. Drag to move; use arrow keys to reposition.`}
      title="Business messages · Drag to move · Arrow keys to reposition"
      style={{ left: launcherPosition.x, top: launcherPosition.y, touchAction: 'none' }}
      className="fixed z-[78] grid size-12 place-items-center rounded-full bg-emerald-800 text-white shadow-lg transition-colors hover:bg-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
    >
      {(incoming || unread > 0) && <span aria-hidden="true" className="absolute inset-0 rounded-full bg-emerald-600/60 animate-ping" />}
      <MessageCircle className="relative size-5" />
      {unread > 0 && <span className="absolute -right-1 -top-1 z-10 grid min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-5 text-white">{unread > 99 ? '99+' : unread}</span>}
    </button>}
  </>, document.body)
}
