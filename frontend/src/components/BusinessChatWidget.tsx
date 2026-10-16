import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, MessageCircle, Plus, Search, Send, X } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useFeatureAccess } from '@/services/featureAccessService'
import { cn } from '@/lib/utils'

type Person = { id: string; name: string; role: string; avatar?: string | null }
type Message = { id: string; senderId: string; recipientId: string; body: string; readAt: string | null; createdAt: string }
type Conversation = { id: string; participant: Person; latestMessage: Message | null; latestUnread?: Message | null; unreadCount: number; updatedAt: string }

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

export function BusinessChatWidget() {
  const { user, hasPermission } = useJWTAuth()
  const { canAccessFeature } = useFeatureAccess()
  const enabled = canAccessFeature('communication') && (user?.role === 'owner' || hasPermission('canViewCommunication'))
  const canSend = user?.role === 'owner' || hasPermission('canCreateCommunication')
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
  const seenMessages = useRef<Set<string> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const refreshConversations = useCallback(async () => {
    if (!enabled) return
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
  }, [enabled, user?.id])

  useEffect(() => {
    if (!enabled) return
    seenMessages.current = null
    void refreshConversations()
    const timer = window.setInterval(() => void refreshConversations(), 5000)
    return () => window.clearInterval(timer)
  }, [enabled, refreshConversations])

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

  if (!enabled) return null

  return <>
    {incoming && !open && <div role="status" className="fixed bottom-[5.25rem] right-4 z-[80] w-[min(22rem,calc(100vw-2rem))] border bg-card p-3 shadow-xl sm:bottom-20">
      <div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-900">{initials(incoming.conversation.participant.name)}</div><button className="min-w-0 flex-1 text-left" onClick={() => { setOpen(true); void loadMessages(incoming.conversation) }}><span className="block text-xs font-semibold">{incoming.conversation.participant.name} sent a message</span><span className="mt-1 block truncate text-sm text-muted-foreground">{incoming.message.body}</span></button><button type="button" aria-label="Dismiss message popup" onClick={() => setIncoming(null)} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="size-4" /></button></div>
    </div>}

    {open && <section aria-label="Business messages" className="fixed inset-x-2 bottom-2 z-[79] flex h-[min(640px,calc(100dvh-5rem))] flex-col overflow-hidden border bg-background shadow-2xl sm:inset-x-auto sm:bottom-20 sm:right-4 sm:w-[min(410px,calc(100vw-2rem))]">
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4"><div className="flex min-w-0 items-center gap-2"><MessageCircle className="size-4 text-emerald-700" /><div><h2 className="text-sm font-semibold">Business messages</h2><p className="text-[11px] text-muted-foreground">Private team communication</p></div></div><button type="button" aria-label="Close messages" onClick={() => setOpen(false)} className="rounded p-2 text-muted-foreground hover:bg-muted"><X className="size-4" /></button></header>
      {selected ? <>
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3"><button type="button" aria-label="Back to conversations" onClick={() => { setSelected(null); setMessages([]); setNewMessageMode(false) }} className="rounded p-2 hover:bg-muted"><ArrowLeft className="size-4" /></button><div className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">{initials(selected.participant.name)}</div><div className="min-w-0"><p className="truncate text-sm font-semibold">{selected.participant.name}</p><p className="text-[11px] capitalize text-muted-foreground">{selected.participant.role.replace(/_/g, ' ')}</p></div></div>
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 p-3">{messages.map((message) => { const own = message.senderId === user?.id; return <div key={message.id} className={cn('max-w-[88%] border px-3 py-2', own ? 'ml-auto border-emerald-800/15 bg-emerald-50' : 'bg-card')}><p className="whitespace-pre-wrap break-words text-sm">{message.body}</p><time className="mt-1 block text-right text-[10px] tabular-nums text-muted-foreground">{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div> })}</div>
        {canSend ? <form onSubmit={sendMessage} className="flex shrink-0 items-center gap-2 border-t bg-card p-3"><input aria-label="Message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} placeholder="Write a message" className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" /><button type="submit" aria-label="Send message" disabled={!draft.trim() || sending} className="grid size-10 shrink-0 place-items-center rounded-md bg-emerald-800 text-white disabled:opacity-50"><Send className="size-4" /></button></form> : <p className="border-t px-4 py-3 text-xs text-muted-foreground">You can read messages but do not have permission to send them.</p>}
      </> : <>
        <div className="flex shrink-0 items-center gap-2 border-b p-3"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input aria-label={newMessageMode ? 'Search team members' : 'Search conversations'} value={peopleSearch} onChange={(event) => setPeopleSearch(event.target.value)} placeholder={newMessageMode ? 'Find a team member' : 'Search conversations'} className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm" /></div>{canSend && <button type="button" aria-label="New message" title="New message" onClick={() => newMessageMode ? setNewMessageMode(false) : void openNewMessage()} className="grid size-9 shrink-0 place-items-center rounded-md border hover:bg-muted"><Plus className="size-4" /></button>}</div>
        <div className="min-h-0 flex-1 overflow-y-auto">{newMessageMode ? filteredPeople.map((person) => <button key={person.id} type="button" onClick={() => void startConversation(person)} className="flex w-full items-center gap-3 border-b px-4 py-3 text-left hover:bg-muted/50"><div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">{initials(person.name)}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{person.name}</p><p className="text-xs capitalize text-muted-foreground">{person.role.replace(/_/g, ' ')}</p></div></button>) : conversations.filter((conversation) => !peopleSearch || conversation.participant.name.toLowerCase().includes(peopleSearch.toLowerCase())).map((conversation) => <button key={conversation.id} type="button" onClick={() => void loadMessages(conversation)} className="flex w-full items-center gap-3 border-b px-4 py-3 text-left hover:bg-muted/50"><div className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-900">{initials(conversation.participant.name)}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{conversation.participant.name}</p>{conversation.unreadCount > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-emerald-800 px-1.5 py-0.5 text-[10px] font-semibold text-white">{conversation.unreadCount}</span>}</div><p className="mt-0.5 truncate text-xs text-muted-foreground">{conversation.latestMessage?.body || 'Start a conversation'}</p></div></button>)}
          {!newMessageMode && conversations.length === 0 && <div className="px-6 py-12 text-center"><MessageCircle className="mx-auto size-8 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">No conversations yet</p><p className="mt-1 text-xs text-muted-foreground">Start a private conversation with someone on your team.</p>{canSend && <button type="button" onClick={() => void openNewMessage()} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-emerald-800"><Plus className="size-4" />New message</button>}</div>}
          {newMessageMode && filteredPeople.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted-foreground">No active team members found.</p>}
        </div>
      </>}
      {error && <div role="alert" className="shrink-0 border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}
    </section>}

    <button type="button" onClick={() => { setOpen((current) => !current); setIncoming(null) }} aria-label="Open business messages" title="Business messages" className="fixed bottom-4 right-4 z-[78] grid size-12 place-items-center rounded-full bg-emerald-800 text-white shadow-lg transition hover:bg-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2">
      <MessageCircle className="size-5" />{unread > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-5 text-white">{unread > 99 ? '99+' : unread}</span>}
    </button>
  </>
}
