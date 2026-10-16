import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Check, CheckCheck, MessageCircle, Plus, Reply, Search, Send, UsersRound, X } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useFeatureAccess } from '@/services/featureAccessService'
import { cn } from '@/lib/utils'

type Person = { id: string; name: string; role: string; avatar?: string | null }
type MessageReaction = { id: string; userId: string; emoji: string }
type Message = { id: string; senderId: string; recipientId: string; body: string; deliveredAt: string | null; readAt: string | null; createdAt: string; replyToMessage?: { id: string; senderId: string; body: string } | null; reactions?: MessageReaction[] }
type Conversation = { id: string; participant: Person; latestMessage: Message | null; latestUnread?: Message | null; unreadCount: number; updatedAt: string }
type LauncherPosition = { x: number; y: number }
const LAUNCHER_SIZE = 48
const LAUNCHER_MARGIN = 12
const LAUNCHER_POSITION_KEY = 'business-chat-launcher-position'
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

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
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null)
  const [activeMessageMenuId, setActiveMessageMenuId] = useState<string | null>(null)
  const [peerTyping, setPeerTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const [incoming, setIncoming] = useState<{ conversation: Conversation; message: Message } | null>(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [launcherPosition, setLauncherPosition] = useState<LauncherPosition | null>(null)
  const seenMessages = useRef<Set<string> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const longPressTimer = useRef<number | null>(null)
  const typingTimeout = useRef<number | null>(null)
  const lastTypingSentAt = useRef(0)
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

  useEffect(() => {
    if (!enabled || !canView) return
    const heartbeat = () => {
      if (document.visibilityState === 'visible') {
        void api('/presence', { method: 'POST' }).catch(() => {})
      }
    }
    heartbeat()
    const timer = window.setInterval(heartbeat, 15_000)
    document.addEventListener('visibilitychange', heartbeat)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', heartbeat)
    }
  }, [enabled, canView])

  const loadMessages = useCallback(async (conversation: Conversation) => {
    try {
      const { messages: rows, peerTyping: isPeerTyping } = await api<{ messages: Message[]; peerTyping: boolean }>(`/conversations/${conversation.id}/messages`)
      setMessages(rows)
      setPeerTyping(isPeerTyping)
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
      void api<{ messages: Message[]; peerTyping: boolean }>(`/conversations/${selected.id}/messages`)
        .then(({ messages: rows, peerTyping: isPeerTyping }) => {
          setMessages(rows)
          setPeerTyping(isPeerTyping)
        })
        .catch(() => {})
    }, 1800)
    return () => {
      window.clearInterval(timer)
      if (typingTimeout.current !== null) window.clearTimeout(typingTimeout.current)
      typingTimeout.current = null
      lastTypingSentAt.current = 0
      void api(`/conversations/${selected.id}/typing`, { method: 'POST', body: JSON.stringify({ typing: false }) }).catch(() => {})
    }
  }, [open, selected?.id])

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages])

  useEffect(() => () => {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current)
  }, [])

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
      const { message } = await api<{ message: Message }>(`/conversations/${selected.id}/messages`, { method: 'POST', body: JSON.stringify({ body: draft.trim(), replyToMessageId: replyToMessage?.id }) })
      setMessages((current) => [...current, message])
      setDraft('')
      setReplyToMessage(null)
      setPeerTyping(false)
      if (typingTimeout.current !== null) window.clearTimeout(typingTimeout.current)
      typingTimeout.current = null
      lastTypingSentAt.current = 0
      await refreshConversations()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Message could not be sent.') }
    finally { setSending(false) }
  }

  function beginMessagePress(messageId: string) {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current)
    longPressTimer.current = window.setTimeout(() => {
      setActiveMessageMenuId(messageId)
      longPressTimer.current = null
    }, 500)
  }

  function endMessagePress() {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current)
    longPressTimer.current = null
  }

  function prepareReply(message: Message) {
    setReplyToMessage(message)
    setActiveMessageMenuId(null)
    window.setTimeout(() => composerRef.current?.focus(), 0)
  }

  async function reactToMessage(message: Message, emoji: string) {
    if (!selected || !canSend) return
    try {
      const { reactions } = await api<{ reactions: MessageReaction[] }>(`/conversations/${selected.id}/messages/${message.id}/reactions`, {
        method: 'POST', body: JSON.stringify({ emoji }),
      })
      setMessages((current) => current.map((row) => row.id === message.id ? { ...row, reactions } : row))
      setActiveMessageMenuId(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Reaction could not be saved.')
    }
  }

  function changeDraft(value: string) {
    setDraft(value)
    if (!selected || !canSend) return
    if (typingTimeout.current !== null) window.clearTimeout(typingTimeout.current)
    if (!value.trim()) {
      lastTypingSentAt.current = 0
      void api(`/conversations/${selected.id}/typing`, { method: 'POST', body: JSON.stringify({ typing: false }) }).catch(() => {})
      return
    }
    if (Date.now() - lastTypingSentAt.current >= 1200) {
      lastTypingSentAt.current = Date.now()
      void api(`/conversations/${selected.id}/typing`, { method: 'POST', body: JSON.stringify({ typing: true }) }).catch(() => {})
    }
    typingTimeout.current = window.setTimeout(() => {
      lastTypingSentAt.current = 0
      typingTimeout.current = null
      void api(`/conversations/${selected.id}/typing`, { method: 'POST', body: JSON.stringify({ typing: false }) }).catch(() => {})
    }, 2200)
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
        <div className="min-w-0 flex-1"><h2 className="truncate text-base font-semibold">{selected?.participant.name || (newMessageMode ? 'New chat' : 'Chats')}</h2><p aria-live="polite" className={cn('truncate text-xs', peerTyping ? 'font-medium text-emerald-700' : 'capitalize text-muted-foreground')}>{selected && peerTyping ? 'Typing…' : selected ? selected.participant.role.replace(/_/g, ' ') : 'Private business team messaging'}</p></div>
        {!selected && canSend && <button type="button" aria-label="Choose a contact" title="New chat" onClick={() => newMessageMode ? setNewMessageMode(false) : void openNewMessage()} className="grid size-10 shrink-0 place-items-center rounded-full text-emerald-800 hover:bg-emerald-50"><UsersRound className="size-5" /></button>}
        <button type="button" aria-label="Close messages" onClick={() => setOpen(false)} className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
      </header>
      {!canView ? <div className="m-auto max-w-sm px-6 text-center"><UsersRound className="mx-auto size-9 text-muted-foreground/50" /><p className="mt-3 text-sm font-semibold">Team Messaging access needed</p><p className="mt-1 text-sm text-muted-foreground">Ask your business admin to grant the “View Team Messaging” permission. Sending messages also requires “Send Team Messages”.</p></div> : selected ? <>
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#efeae2] px-3 py-4 sm:px-4">
          {messages.map((message) => {
            const own = message.senderId === user?.id
            const status = message.readAt ? 'Read' : message.deliveredAt ? 'Delivered' : 'Sent; recipient offline'
            const StatusIcon = message.deliveredAt ? CheckCheck : Check
            const reactionCounts = new Map<string, { count: number; mine: boolean }>()
            for (const reaction of message.reactions || []) {
              const current = reactionCounts.get(reaction.emoji) || { count: 0, mine: false }
              reactionCounts.set(reaction.emoji, { count: current.count + 1, mine: current.mine || reaction.userId === user?.id })
            }
            return <div key={message.id} className={cn('relative max-w-[88%] sm:max-w-[82%]', own ? 'ml-auto' : 'mr-auto')}>
              {activeMessageMenuId === message.id && canSend && <div className={cn('absolute -top-11 z-20 flex items-center gap-1 rounded-full border bg-card p-1 shadow-lg', own ? 'right-0' : 'left-0')}>
                {QUICK_REACTIONS.map((emoji) => <button key={emoji} type="button" aria-label={`React ${emoji}`} onClick={() => void reactToMessage(message, emoji)} className="grid size-8 place-items-center rounded-full text-lg hover:bg-muted">{emoji}</button>)}
                <span className="mx-0.5 h-5 w-px bg-border" />
                <button type="button" aria-label="Reply to message" onClick={() => prepareReply(message)} className="grid size-8 place-items-center rounded-full hover:bg-muted"><Reply className="size-4" /></button>
              </div>}
              <div
                onContextMenu={(event) => { event.preventDefault(); setActiveMessageMenuId(message.id) }}
                onPointerDown={(event) => { if (event.button === 0) beginMessagePress(message.id) }}
                onPointerUp={endMessagePress}
                onPointerCancel={endMessagePress}
                onPointerLeave={endMessagePress}
                className={cn('select-text touch-pan-y px-3 py-2 shadow-sm', own ? 'rounded-2xl rounded-br-sm bg-[#d9fdd3]' : 'rounded-2xl rounded-bl-sm bg-white')}
              >
                {message.replyToMessage && <div className="mb-2 border-l-2 border-emerald-700/60 bg-black/5 px-2 py-1"><p className="text-[10px] font-semibold text-emerald-800">{message.replyToMessage.senderId === user?.id ? 'You' : selected?.participant.name}</p><p className="line-clamp-2 whitespace-pre-wrap break-words text-xs text-[#53615a]">{message.replyToMessage.body}</p></div>}
                <p className="whitespace-pre-wrap break-words text-sm leading-5 text-[#17211b]">{message.body}</p>
                <div className="mt-1 flex items-center justify-end gap-1"><time className="text-[10px] tabular-nums text-[#667781]">{conversationTime(message.createdAt)}</time>{own && <span className={cn('inline-flex items-center', message.readAt ? 'text-sky-600' : 'text-slate-500')} title={status} aria-label={status}><StatusIcon className="size-3.5" aria-hidden="true" /></span>}</div>
              </div>
              {reactionCounts.size > 0 && <div className={cn('mt-1 flex flex-wrap gap-1', own ? 'justify-end' : 'justify-start')}>{[...reactionCounts].map(([emoji, value]) => <button key={emoji} type="button" onClick={() => void reactToMessage(message, emoji)} aria-label={`${emoji}, ${value.count} reactions`} className={cn('inline-flex h-7 items-center gap-1 rounded-full border bg-card px-2 text-sm shadow-sm', value.mine && 'border-emerald-500 bg-emerald-50')}>{emoji}<span className="text-[11px] text-muted-foreground">{value.count}</span></button>)}</div>}
            </div>
          })}
        </div>
        {canSend ? <form onSubmit={sendMessage} className="shrink-0 border-t bg-card p-3">
          {replyToMessage && <div className="mb-2 flex items-center gap-2 border-l-2 border-emerald-700 bg-muted/60 px-2 py-1.5"><div className="min-w-0 flex-1"><p className="text-[10px] font-semibold text-emerald-800">Replying to {replyToMessage.senderId === user?.id ? 'yourself' : selected?.participant.name}</p><p className="truncate text-xs text-muted-foreground">{replyToMessage.body}</p></div><button type="button" aria-label="Cancel reply" onClick={() => setReplyToMessage(null)} className="grid size-7 place-items-center rounded-full hover:bg-muted"><X className="size-4" /></button></div>}
          <div className="flex items-end gap-2"><textarea ref={composerRef} aria-label="Message" value={draft} onChange={(event) => changeDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} maxLength={4000} rows={1} placeholder="Message" className="max-h-28 min-h-10 min-w-0 flex-1 resize-y rounded-2xl border bg-background px-4 py-2.5 text-sm" /><button type="submit" aria-label="Send message" disabled={!draft.trim() || sending} className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-800 text-white disabled:opacity-50"><Send className="size-4" /></button></div>
        </form> : <p className="border-t bg-card px-4 py-3 text-xs text-muted-foreground">You can read messages but do not have permission to send them.</p>}
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
