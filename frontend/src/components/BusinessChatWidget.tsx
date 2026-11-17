import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Check, CheckCheck, MessageCircle, MoreHorizontal, Paperclip, Plus, Reply, Search, Send, Smile, UsersRound, X } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useFeatureAccess } from '@/services/featureAccessService'
import { cn } from '@/lib/utils'
import { lazy, Suspense } from 'react'
import { Globe2 } from 'lucide-react'

const JibuNetworkPage = lazy(() => import('@/pages/JibuNetworkPage'))

type Person = { id: string; name: string; role: string; avatar?: string | null }
type MessageReaction = { id: string; userId: string; emoji: string }
type Message = { id: string; senderId: string; recipientId: string; body: string; imageUrl?: string | null; deliveredAt: string | null; readAt: string | null; createdAt: string; replyToMessage?: { id: string; senderId: string; body: string } | null; reactions?: MessageReaction[] }
type Conversation = { id: string; participant: Person; latestMessage: Message | null; latestUnread?: Message | null; unreadCount: number; updatedAt: string }
type NetworkPerson = { id: string; name: string; avatar?: string | null; jibuId?: string }
type NetworkMessage = { id: string; senderId: string; body: string; imageUrl?: string | null; deliveredAt: string | null; readAt: string | null; createdAt: string; replyToMessage?: { id: string; senderId: string; body: string } | null; reactions?: MessageReaction[] }
type NetworkChat = { id: string; status: 'pending' | 'accepted'; incoming: boolean; participant: NetworkPerson; latestMessage: NetworkMessage | null; latestUnread?: NetworkMessage | null; unreadCount: number; updatedAt: string }
type IncomingNotice =
  | { source: 'business'; conversation: Conversation; message: Message }
  | { source: 'network'; chat: NetworkChat; message: NetworkMessage }
type InboxEntry =
  | { source: 'business'; id: string; participant: Person; latestMessage: Message | null; unreadCount: number; updatedAt: string }
  | ({ source: 'network' } & NetworkChat)
type LauncherPosition = { x: number; y: number }
const LAUNCHER_SIZE = 48
const LAUNCHER_MARGIN = 12
const LAUNCHER_POSITION_KEY = 'business-chat-launcher-position'
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']
const COMPOSER_EMOJIS = ['😀', '😃', '😄', '😁', '😆', '🥰', '😍', '😘', '😊', '😉', '🤔', '😎', '🥳', '😭', '😅', '🙏', '👏', '🙌', '👍', '👎', '❤️', '🔥', '🎉', '💯']

function clampLauncherPosition(position: LauncherPosition): LauncherPosition {
  return {
    x: Math.max(LAUNCHER_MARGIN, Math.min(position.x, window.innerWidth - LAUNCHER_SIZE - LAUNCHER_MARGIN)),
    y: Math.max(LAUNCHER_MARGIN, Math.min(position.y, window.innerHeight - LAUNCHER_SIZE - LAUNCHER_MARGIN)),
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body instanceof FormData) headers.delete('Content-Type')
  else if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await apiFetch(`/api/messages${path}`, {
    ...init,
    cache: 'no-store',
    headers,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error || payload?.message || 'Business messages are unavailable.')
  return payload as T
}

async function networkApi<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body instanceof FormData) headers.delete('Content-Type')
  else if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await apiFetch(`/api/network${path}`, {
    ...init,
    cache: 'no-store',
    headers,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error || payload?.message || 'Network chats are unavailable.')
  return payload as T
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U'
}

function ChatAvatar({ name, avatar, size = 'md' }: { name: string; avatar?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'size-12 text-sm' : size === 'sm' ? 'size-7 text-[10px]' : 'size-10 text-xs'
  return avatar
    ? <img src={avatar} alt={`${name}'s profile picture`} className={cn(sizeClass, 'shrink-0 rounded-full border border-white/70 object-cover shadow-sm dark:border-border')} />
    : <div role="img" aria-label={`${name}'s profile picture`} className={cn(sizeClass, 'grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-100 to-teal-200 font-semibold text-emerald-900 shadow-sm dark:from-emerald-950 dark:to-teal-950 dark:text-emerald-100')}>{initials(name)}</div>
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
  const canView = user?.role === 'owner' || hasPermission('canViewTeamMessaging') || hasPermission('canSendTeamMessages')
  const canSend = canView && (user?.role === 'owner' || hasPermission('canSendTeamMessages'))
  const [open, setOpen] = useState(false)
  const [networkOpen, setNetworkOpen] = useState(false)
  const [newMessageMode, setNewMessageMode] = useState(false)
  const [inboxType, setInboxType] = useState<'business' | 'network'>('business')
  const [people, setPeople] = useState<Person[]>([])
  const [peopleSearch, setPeopleSearch] = useState('')
  const [peopleLoading, setPeopleLoading] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [networkChats, setNetworkChats] = useState<NetworkChat[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkChat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [networkMessages, setNetworkMessages] = useState<NetworkMessage[]>([])
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null)
  const [activeMessageMenuId, setActiveMessageMenuId] = useState<string | null>(null)
  const [peerTyping, setPeerTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [incoming, setIncoming] = useState<IncomingNotice | null>(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [launcherPosition, setLauncherPosition] = useState<LauncherPosition | null>(null)
  const seenMessages = useRef<Set<string> | null>(null)
  const seenNetworkMessages = useRef<Set<string> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const sendingRef = useRef(false)
  const pendingMessageRef = useRef<{ signature: string; id: string; file: File | null } | null>(null)
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
    const incomingCandidates: IncomingNotice[] = []
    const [businessResult, networkResult] = await Promise.allSettled([
      api<{ conversations: Conversation[] }>('/conversations'),
      networkApi<{ profile: { enabled: boolean } }>('/me'),
    ])
    if (businessResult.status === 'fulfilled') {
      const rows = businessResult.value.conversations
      const firstLoad = seenMessages.current === null
      const fresh = rows
        .map((conversation) => ({ conversation, message: conversation.latestUnread || conversation.latestMessage }))
        .filter((item): item is { conversation: Conversation; message: Message } => Boolean(
          item.message && item.message.senderId !== user?.id &&
          (firstLoad ? item.conversation.unreadCount > 0 : !seenMessages.current?.has(item.message.id)),
        ))
        .sort((a, b) => new Date(b.message.createdAt).getTime() - new Date(a.message.createdAt).getTime())[0]
      if (fresh) incomingCandidates.push({ source: 'business', ...fresh })
      seenMessages.current = new Set(rows.flatMap((row) => [row.latestMessage?.id, row.latestUnread?.id]).filter((id): id is string => Boolean(id)))
      setConversations(rows)
    }
    if (networkResult.status === 'fulfilled') {
      if (networkResult.value.profile.enabled) {
        const chats = await networkApi<{ chats: NetworkChat[] }>('/chats').catch(() => null)
        if (chats) {
          const firstLoad = seenNetworkMessages.current === null
          const fresh = chats.chats
            .map((chat) => ({ chat, message: chat.latestUnread || chat.latestMessage }))
            .filter((item): item is { chat: NetworkChat; message: NetworkMessage } => Boolean(
              item.message && item.message.senderId !== user?.id &&
              (firstLoad ? item.chat.unreadCount > 0 : !seenNetworkMessages.current?.has(item.message.id)),
            ))
            .sort((a, b) => new Date(b.message.createdAt).getTime() - new Date(a.message.createdAt).getTime())[0]
          if (fresh) incomingCandidates.push({ source: 'network', ...fresh })
          seenNetworkMessages.current = new Set(chats.chats.flatMap((chat) => [chat.latestMessage?.id, chat.latestUnread?.id]).filter((id): id is string => Boolean(id)))
          setNetworkChats(chats.chats)
        }
      } else {
        seenNetworkMessages.current = new Set()
        setNetworkChats([])
      }
    }
    const newestIncoming = incomingCandidates.sort((a, b) => new Date(b.message.createdAt).getTime() - new Date(a.message.createdAt).getTime())[0]
    if (newestIncoming) setIncoming(newestIncoming)
  }, [enabled, canView, user?.id])

  useEffect(() => {
    if (!enabled || !canView) return
    seenMessages.current = null
    seenNetworkMessages.current = null
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
      setSelectedNetwork(null)
      setNetworkMessages([])
      setImageFile(null)
      setDraft('')
      pendingMessageRef.current = null
      setReplyToMessage(null)
      setActiveMessageMenuId(null)
      setEmojiPickerOpen(false)
      setInboxType('business')
      setSelected(conversation)
      setIncoming((current) => current?.source === 'business' && current.conversation.id === conversation.id ? null : current)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not open this conversation.')
    }
  }, [])

  const loadNetworkMessages = useCallback(async (chat: NetworkChat) => {
    try {
      const result = await networkApi<{ messages: NetworkMessage[]; status: NetworkChat['status'] }>(`/chats/${chat.id}/messages`)
      setNetworkMessages(result.messages)
      setNetworkChats((current) => current.map((row) => row.id === chat.id ? { ...row, unreadCount: 0, status: result.status } : row))
      setSelected(null)
      setMessages([])
      setImageFile(null)
      setDraft('')
      pendingMessageRef.current = null
      setInboxType('network')
      setSelectedNetwork({ ...chat, status: result.status })
      setIncoming((current) => current?.source === 'network' && current.chat.id === chat.id ? null : current)
      setReplyToMessage(null)
      setActiveMessageMenuId(null)
      setEmojiPickerOpen(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not open this Network chat.')
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

  useEffect(() => {
    if (!open || !selectedNetwork) return
    let active = true
    const refreshNetworkMessages = async () => {
      try {
        const result = await networkApi<{ messages: NetworkMessage[]; status: NetworkChat['status'] }>(`/chats/${selectedNetwork.id}/messages`)
        if (!active) return
        setNetworkMessages(result.messages)
        setSelectedNetwork((current) => current?.id === selectedNetwork.id ? { ...current, status: result.status } : current)
      } catch { /* Retain the visible thread through brief network interruptions. */ }
    }
    void refreshNetworkMessages()
    const timer = window.setInterval(() => void refreshNetworkMessages(), 2200)
    return () => { active = false; window.clearInterval(timer) }
  }, [open, selectedNetwork?.id])

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [messages, networkMessages])

  useEffect(() => () => {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current)
  }, [])

  const inboxEntries = useMemo<InboxEntry[]>(() => [
    ...conversations.map((conversation) => ({ ...conversation, source: 'business' as const })),
    ...networkChats.map((chat) => ({ ...chat, source: 'network' as const })),
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [conversations, networkChats])
  const unread = useMemo(() => inboxEntries.reduce((total, row) => total + row.unreadCount, 0), [inboxEntries])
  const businessUnread = useMemo(() => conversations.reduce((total, row) => total + row.unreadCount, 0), [conversations])
  const networkUnread = useMemo(() => networkChats.reduce((total, row) => total + row.unreadCount, 0), [networkChats])
  const filteredPeople = useMemo(() => people.filter((person) => person.name.toLowerCase().includes(peopleSearch.toLowerCase())), [people, peopleSearch])

  async function startConversation(person: Person) {
    try {
      setInboxType('business')
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
    setInboxType('business')
    setNewMessageMode(true)
    setSelected(null)
    setSelectedNetwork(null)
    setMessages([])
    setNetworkMessages([])
    setImageFile(null)
    setReplyToMessage(null)
    setActiveMessageMenuId(null)
    setEmojiPickerOpen(false)
    setPeopleSearch('')
    setPeopleLoading(true)
    try {
      const { people: rows } = await api<{ people: Person[] }>('/people')
      setPeople(rows)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load team members.') }
    finally { setPeopleLoading(false) }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault()
    if (!selected || (!draft.trim() && !imageFile) || !canSend || sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    setError('')
    const body = draft.trim()
    const signature = JSON.stringify([selected.id, body, replyToMessage?.id, imageFile?.name, imageFile?.size, imageFile?.lastModified])
    const requestId = pendingMessageRef.current?.signature === signature && pendingMessageRef.current.file === imageFile ? pendingMessageRef.current.id : crypto.randomUUID()
    pendingMessageRef.current = { signature, id: requestId, file: imageFile }
    try {
      const payload = imageFile ? new FormData() : null
      if (payload) {
        payload.set('body', body)
        payload.set('replyToMessageId', replyToMessage?.id || '')
        payload.set('clientMessageId', requestId)
        payload.set('image', imageFile)
      }
      const { message } = await api<{ message: Message }>(`/conversations/${selected.id}/messages`, {
        method: 'POST',
        body: payload || JSON.stringify({ body, replyToMessageId: replyToMessage?.id, clientMessageId: requestId }),
      })
      setMessages((current) => current.some((row) => row.id === message.id) ? current.map((row) => row.id === message.id ? message : row) : [...current, message])
      setDraft('')
      setImageFile(null)
      if (imageInputRef.current) imageInputRef.current.value = ''
      pendingMessageRef.current = null
      setReplyToMessage(null)
      setEmojiPickerOpen(false)
      setPeerTyping(false)
      if (typingTimeout.current !== null) window.clearTimeout(typingTimeout.current)
      typingTimeout.current = null
      lastTypingSentAt.current = 0
      await refreshConversations()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Message could not be sent.') }
    finally { sendingRef.current = false; setSending(false) }
  }

  async function sendNetworkMessage(event: FormEvent) {
    event.preventDefault()
    if (!selectedNetwork || selectedNetwork.status !== 'accepted' || (!draft.trim() && !imageFile) || !canSend || sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    setError('')
    const body = draft.trim()
    const signature = JSON.stringify([selectedNetwork.id, body, imageFile?.name, imageFile?.size, imageFile?.lastModified])
    const requestId = pendingMessageRef.current?.signature === signature && pendingMessageRef.current.file === imageFile ? pendingMessageRef.current.id : crypto.randomUUID()
    pendingMessageRef.current = { signature, id: requestId, file: imageFile }
    try {
      const payload = new FormData()
      payload.set('body', body)
      payload.set('clientMessageId', requestId)
      if (imageFile) payload.set('image', imageFile)
      const { message } = await networkApi<{ message: NetworkMessage }>(`/chats/${selectedNetwork.id}/messages`, {
        method: 'POST',
        body: payload,
      })
      setDraft('')
      setImageFile(null)
      if (imageInputRef.current) imageInputRef.current.value = ''
      pendingMessageRef.current = null
      setEmojiPickerOpen(false)
      setNetworkMessages((current) => current.some((row) => row.id === message.id) ? current.map((row) => row.id === message.id ? message : row) : [...current, message])
      await refreshConversations()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Network message could not be sent.')
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  function chooseChatImage(file?: File) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Choose a JPEG, PNG, or WebP image no larger than 5 MB.')
      if (imageInputRef.current) imageInputRef.current.value = ''
      return
    }
    setError('')
    setImageFile(file)
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  async function respondToNetworkRequest(accept: boolean) {
    if (!selectedNetwork || !canSend) return
    setSending(true)
    setError('')
    try {
      await networkApi(`/chats/${selectedNetwork.id}/${accept ? 'accept' : 'decline'}`, { method: 'POST', body: '{}' })
      if (accept) {
        const accepted = { ...selectedNetwork, status: 'accepted' as const }
        setSelectedNetwork(accepted)
        await loadNetworkMessages(accepted)
      } else {
        setSelectedNetwork(null)
        setNetworkMessages([])
      }
      await refreshConversations()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Message request could not be updated.')
    } finally {
      setSending(false)
    }
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

  function insertEmoji(emoji: string) {
    const composer = composerRef.current
    const start = composer?.selectionStart ?? draft.length
    const end = composer?.selectionEnd ?? draft.length
    const nextDraft = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`
    changeDraft(nextDraft)
    setEmojiPickerOpen(false)
    window.requestAnimationFrame(() => {
      composer?.focus()
      composer?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
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
    if (!selected || selectedNetwork || !canSend) return
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

  const activeMessages: (Message | NetworkMessage)[] = selectedNetwork ? networkMessages : messages
  const activePeer = selected?.participant || selectedNetwork?.participant || null
  const visibleInboxEntries = inboxEntries.filter((entry) => entry.source === inboxType && (!peopleSearch || entry.participant.name.toLowerCase().includes(peopleSearch.toLowerCase())))

  return createPortal(<>
    {incoming && !open && <div role="status" className="fixed bottom-[5.25rem] right-4 z-[80] w-[min(22rem,calc(100vw-2rem))] border bg-card p-3 shadow-xl sm:bottom-20">
      <div className="flex items-start gap-3"><ChatAvatar name={incoming.source === 'business' ? incoming.conversation.participant.name : incoming.chat.participant.name} avatar={incoming.source === 'business' ? incoming.conversation.participant.avatar : incoming.chat.participant.avatar} size="sm" /><button className="min-w-0 flex-1 text-left" onClick={() => { setOpen(true); if (incoming.source === 'business') void loadMessages(incoming.conversation); else void loadNetworkMessages(incoming.chat) }}><span className="block text-xs font-semibold">{incoming.source === 'business' ? incoming.conversation.participant.name : incoming.chat.participant.name} {incoming.source === 'network' ? 'sent a JibuSales Network message' : 'sent a message'}</span><span className="mt-1 block truncate text-sm text-muted-foreground">{incoming.message.body || (incoming.message.imageUrl ? '📷 Photo' : '')}</span></button><button type="button" aria-label="Dismiss message popup" onClick={() => setIncoming(null)} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="size-4" /></button></div>
    </div>}

    {open && <section aria-label="Chats" className="fixed inset-0 z-[79] flex flex-col overflow-hidden bg-background sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-auto sm:h-[min(720px,calc(100dvh-2rem))] sm:w-[min(520px,calc(100vw-2rem))] sm:border sm:shadow-2xl lg:h-[min(820px,calc(100dvh-2rem))] lg:w-[min(600px,calc(100vw-2rem))]">
      {networkOpen ? <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Opening Team Messaging…</div>}><JibuNetworkPage embedded onClose={() => { setNetworkOpen(false); void refreshConversations() }} /></Suspense> : <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-card px-4">
        {activePeer ? <button type="button" aria-label="Back to chats" onClick={() => { setSelected(null); setSelectedNetwork(null); setMessages([]); setNetworkMessages([]); setReplyToMessage(null); setActiveMessageMenuId(null); setNewMessageMode(false); setDraft('') }} className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-muted"><ArrowLeft className="size-5" /></button> : <div className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-900"><MessageCircle className="size-5" /></div>}
        {activePeer && <ChatAvatar name={activePeer.name} avatar={activePeer.avatar} />}
        <div className="min-w-0 flex-1"><h2 className="truncate text-base font-semibold">{activePeer?.name || (newMessageMode ? 'New chat' : 'Chats')}</h2><p aria-live="polite" className={cn('truncate text-xs', peerTyping ? 'font-medium text-emerald-700' : 'capitalize text-muted-foreground')}>{selected && peerTyping ? 'Typing…' : selectedNetwork ? 'JibuSales Network' : selected ? selected.participant.role.replace(/_/g, ' ') : newMessageMode ? 'Business chat' : inboxType === 'business' ? 'Private business conversations' : 'JibuSales Network conversations'}</p></div>
        {!activePeer && inboxType === 'business' && canSend && <button type="button" aria-label={newMessageMode ? 'Back to business chats' : 'Choose a business contact'} title={newMessageMode ? 'Back to business chats' : 'New business chat'} onClick={() => newMessageMode ? setNewMessageMode(false) : void openNewMessage()} className="grid size-10 shrink-0 place-items-center rounded-full text-emerald-800 hover:bg-emerald-50"><UsersRound className="size-5" /></button>}
        {!activePeer && canView && <button type="button" aria-label="Open JibuSales Network" title="Open JibuSales Network" onClick={() => setNetworkOpen(true)} className="grid size-10 shrink-0 place-items-center rounded-full text-emerald-800 hover:bg-emerald-50"><Globe2 className="size-5" /></button>}
        <button type="button" aria-label="Close messages" onClick={() => setOpen(false)} className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
      </header>
      {!activePeer && !newMessageMode && <div role="tablist" aria-label="Conversation type" className="flex shrink-0 border-b bg-card px-2">
        <button type="button" role="tab" aria-selected={inboxType === 'business'} onClick={() => { setInboxType('business'); setPeopleSearch('') }} className={cn('flex flex-1 items-center justify-center gap-2 border-b-2 px-3 py-3 text-sm', inboxType === 'business' ? 'border-emerald-700 font-semibold text-emerald-800' : 'border-transparent text-muted-foreground hover:text-foreground')}>Business chats{businessUnread > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-emerald-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">{businessUnread}</span>}</button>
        <button type="button" role="tab" aria-selected={inboxType === 'network'} onClick={() => { setInboxType('network'); setPeopleSearch('') }} className={cn('flex flex-1 items-center justify-center gap-2 border-b-2 px-3 py-3 text-sm', inboxType === 'network' ? 'border-emerald-700 font-semibold text-emerald-800' : 'border-transparent text-muted-foreground hover:text-foreground')}>JibuSales Network{networkUnread > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-emerald-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">{networkUnread}</span>}</button>
      </div>}
      {!canView ? <div className="m-auto max-w-sm px-6 text-center"><UsersRound className="mx-auto size-9 text-muted-foreground/50" /><p className="mt-3 text-sm font-semibold">Team Messaging access needed</p><p className="mt-1 text-sm text-muted-foreground">Ask your business admin to grant the “View Team Messaging” permission. Sending messages also requires “Send Team Messages”.</p></div> : (selected || selectedNetwork) ? <>
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#efeae2] bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.06)_1px,transparent_0)] [background-size:18px_18px] px-3 py-4 dark:bg-background dark:bg-none sm:px-4">
          {activeMessages.map((message) => {
            const own = message.senderId === user?.id
            const senderName = own ? user?.name || 'You' : activePeer?.name || 'Team member'
            const senderAvatar = own ? user?.avatar : activePeer?.avatar
            const status = message.readAt ? 'Read' : message.deliveredAt ? 'Delivered' : 'Sent; recipient offline'
            const StatusIcon = message.deliveredAt ? CheckCheck : Check
            const reactionCounts = new Map<string, { count: number; mine: boolean }>()
            for (const reaction of message.reactions || []) {
              const current = reactionCounts.get(reaction.emoji) || { count: 0, mine: false }
              reactionCounts.set(reaction.emoji, { count: current.count + 1, mine: current.mine || reaction.userId === user?.id })
            }
            return <div key={message.id} className={cn('flex max-w-[94%] items-end gap-2 sm:max-w-[88%]', own ? 'ml-auto flex-row-reverse' : 'mr-auto')}>
              <ChatAvatar name={senderName} avatar={senderAvatar} size="sm" />
              <div className="relative min-w-0 max-w-[calc(100%_-_2.25rem)]">
              {activeMessageMenuId === message.id && canSend && selected && <div className={cn('absolute -top-11 z-20 flex items-center gap-1 rounded-full border bg-card p-1 shadow-lg', own ? 'right-0' : 'left-0')}>
                {QUICK_REACTIONS.map((emoji) => <button key={emoji} type="button" aria-label={`React ${emoji}`} onClick={() => void reactToMessage(message as Message, emoji)} className="grid size-8 place-items-center rounded-full text-lg hover:bg-muted">{emoji}</button>)}
                <span className="mx-0.5 h-5 w-px bg-border" />
                <button type="button" aria-label="Reply to message" onClick={() => prepareReply(message as Message)} className="grid size-8 place-items-center rounded-full hover:bg-muted"><Reply className="size-4" /></button>
              </div>}
              <div
                onContextMenu={(event) => { if (!selected) return; event.preventDefault(); setActiveMessageMenuId(message.id) }}
                onPointerDown={(event) => { if (selected && event.button === 0) beginMessagePress(message.id) }}
                onPointerUp={endMessagePress}
                onPointerCancel={endMessagePress}
                onPointerLeave={endMessagePress}
                className={cn('select-text touch-pan-y px-3 py-2 shadow-sm ring-1 ring-black/[0.03] transition-shadow hover:shadow-md', own ? 'rounded-2xl rounded-br-sm bg-[#d9fdd3] dark:bg-emerald-950/80' : 'rounded-2xl rounded-bl-sm bg-white dark:bg-muted')}
              >
                {message.replyToMessage && <div className="mb-2 rounded-r-md border-l-[3px] border-emerald-700/60 bg-black/5 px-2 py-1 dark:border-emerald-400/70 dark:bg-white/5"><p className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">{message.replyToMessage.senderId === user?.id ? 'You' : activePeer?.name}</p><p className="line-clamp-2 whitespace-pre-wrap break-words text-xs text-[#53615a] dark:text-muted-foreground">{message.replyToMessage.body}</p></div>}
                {message.imageUrl && <img src={message.imageUrl} alt="Shared image" className="mb-2 max-h-64 max-w-full rounded-lg object-contain" />}
                {message.body && <p className="whitespace-pre-wrap break-words text-sm leading-5 text-[#17211b] dark:text-foreground">{message.body}</p>}
                <div className="mt-1 flex items-center justify-end gap-1"><time className="text-[10px] tabular-nums text-[#667781] dark:text-muted-foreground">{conversationTime(message.createdAt)}</time>{own && <span className={cn('inline-flex items-center', message.readAt ? 'text-sky-600' : 'text-slate-500')} title={status} aria-label={status}><StatusIcon className="size-3.5" aria-hidden="true" /></span>}{!selectedNetwork && canSend && <button type="button" aria-label={`Message actions for ${message.body.slice(0, 40)}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => setActiveMessageMenuId((current) => current === message.id ? null : message.id)} className="ml-1 grid size-6 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:bg-black/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 dark:hover:bg-white/10"><MoreHorizontal className="size-4" /></button>}</div>
              </div>
              {!selectedNetwork && reactionCounts.size > 0 && <div className={cn('mt-1 flex flex-wrap gap-1', own ? 'justify-end' : 'justify-start')}>{[...reactionCounts].map(([emoji, value]) => <button key={emoji} type="button" onClick={() => void reactToMessage(message as Message, emoji)} aria-label={`${emoji}, ${value.count} reactions`} className={cn('inline-flex h-7 items-center gap-1 rounded-full border bg-card px-2 text-sm shadow-sm', value.mine && 'border-emerald-500 bg-emerald-50')}>{emoji}<span className="text-[11px] text-muted-foreground">{value.count}</span></button>)}</div>}
            </div>
            </div>
          })}
        </div>
        {selectedNetwork?.status === 'pending' ? selectedNetwork.incoming ? <div className="flex shrink-0 gap-2 border-t bg-card p-3"><button type="button" disabled={!canSend || sending} onClick={() => void respondToNetworkRequest(false)} className="h-10 flex-1 rounded-lg border text-sm font-medium disabled:opacity-50">Decline request</button><button type="button" disabled={!canSend || sending} onClick={() => void respondToNetworkRequest(true)} className="h-10 flex-1 rounded-lg bg-emerald-800 text-sm font-medium text-white disabled:opacity-50">Accept and reply</button></div> : <p className="border-t bg-card px-4 py-3 text-center text-xs text-muted-foreground">Your message request was sent. You can chat after they accept it.</p>
        : selectedNetwork && canSend ? <form onSubmit={sendNetworkMessage} className="shrink-0 border-t bg-card p-3">
          {imageFile && <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs"><Paperclip className="size-4" /><span className="min-w-0 flex-1 truncate">{imageFile.name}</span><button type="button" aria-label="Remove attached image" onClick={() => setImageFile(null)}><X className="size-4" /></button></div>}
          <input ref={imageInputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseChatImage(event.target.files?.[0])} />
          <div className="relative flex items-end gap-2"><button type="button" aria-label="Attach image" onClick={() => imageInputRef.current?.click()} className="grid size-10 shrink-0 place-items-center rounded-full text-emerald-800 hover:bg-emerald-50"><Paperclip className="size-5" /></button><button type="button" aria-label="Choose an emoji" aria-expanded={emojiPickerOpen} onClick={() => setEmojiPickerOpen((open) => !open)} className="grid size-10 shrink-0 place-items-center rounded-full text-emerald-800 transition-colors hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950"><Smile className="size-5" /></button>{emojiPickerOpen && <div role="group" aria-label="Choose an emoji" className="absolute bottom-12 left-0 z-30 grid w-64 grid-cols-8 gap-1 rounded-2xl border bg-card p-2 shadow-xl">{COMPOSER_EMOJIS.map((emoji) => <button key={emoji} type="button" aria-label={`Insert ${emoji} emoji`} onClick={() => insertEmoji(emoji)} className="grid size-7 place-items-center rounded-lg text-lg transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">{emoji}</button>)}</div>}<textarea ref={composerRef} aria-label="Message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} maxLength={4000} rows={1} placeholder="Message" className="max-h-28 min-h-10 min-w-0 flex-1 resize-y rounded-2xl border bg-background px-4 py-2.5 text-sm shadow-inner shadow-black/[0.02]" /><button type="submit" aria-label="Send message" disabled={(!draft.trim() && !imageFile) || sending} className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-700 to-teal-800 text-white shadow-md transition-transform hover:scale-105 disabled:opacity-50"><Send className="size-4" /></button></div></form>
        : selectedNetwork ? <p className="border-t bg-card px-4 py-3 text-xs text-muted-foreground">You can read messages but do not have permission to send them.</p>
        : canSend ? <form onSubmit={sendMessage} className="shrink-0 border-t bg-card p-3">
          {replyToMessage && <div className="mb-2 flex items-center gap-2 border-l-2 border-emerald-700 bg-muted/60 px-2 py-1.5"><div className="min-w-0 flex-1"><p className="text-[10px] font-semibold text-emerald-800">Replying to {replyToMessage.senderId === user?.id ? 'yourself' : selected?.participant.name}</p><p className="truncate text-xs text-muted-foreground">{replyToMessage.body}</p></div><button type="button" aria-label="Cancel reply" onClick={() => setReplyToMessage(null)} className="grid size-7 place-items-center rounded-full hover:bg-muted"><X className="size-4" /></button></div>}
          {imageFile && <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs"><Paperclip className="size-4" /><span className="min-w-0 flex-1 truncate">{imageFile.name}</span><button type="button" aria-label="Remove attached image" onClick={() => setImageFile(null)}><X className="size-4" /></button></div>}
          <input ref={imageInputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseChatImage(event.target.files?.[0])} />
          <div className="relative flex items-end gap-2"><button type="button" aria-label="Attach image" onClick={() => imageInputRef.current?.click()} className="grid size-10 shrink-0 place-items-center rounded-full text-emerald-800 hover:bg-emerald-50"><Paperclip className="size-5" /></button><button type="button" aria-label="Choose an emoji" aria-expanded={emojiPickerOpen} onClick={() => setEmojiPickerOpen((open) => !open)} className="grid size-10 shrink-0 place-items-center rounded-full text-emerald-800 transition-colors hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950"><Smile className="size-5" /></button>{emojiPickerOpen && <div role="group" aria-label="Choose an emoji" className="absolute bottom-12 left-0 z-30 grid w-64 grid-cols-8 gap-1 rounded-2xl border bg-card p-2 shadow-xl">{COMPOSER_EMOJIS.map((emoji) => <button key={emoji} type="button" aria-label={`Insert ${emoji} emoji`} onClick={() => insertEmoji(emoji)} className="grid size-7 place-items-center rounded-lg text-lg transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">{emoji}</button>)}</div>}<textarea ref={composerRef} aria-label="Message" value={draft} onChange={(event) => changeDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} maxLength={4000} rows={1} placeholder="Message" className="max-h-28 min-h-10 min-w-0 flex-1 resize-y rounded-2xl border bg-background px-4 py-2.5 text-sm shadow-inner shadow-black/[0.02]" /><button type="submit" aria-label="Send message" disabled={(!draft.trim() && !imageFile) || sending} className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-700 to-teal-800 text-white shadow-md transition-transform hover:scale-105 disabled:opacity-50"><Send className="size-4" /></button></div>
        </form> : <p className="border-t bg-card px-4 py-3 text-xs text-muted-foreground">You can read messages but do not have permission to send them.</p>}
      </> : <>
        <div className="shrink-0 border-b p-3"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input aria-label={newMessageMode ? 'Search contacts' : `Search ${inboxType === 'business' ? 'business' : 'JibuSales Network'} chats`} value={peopleSearch} onChange={(event) => setPeopleSearch(event.target.value)} placeholder={newMessageMode ? 'Search contacts' : `Search ${inboxType === 'business' ? 'business' : 'Network'} chats`} className="h-10 w-full rounded-full border-0 bg-muted/70 pl-10 pr-4 text-sm" /></div></div>
        <div className="min-h-0 flex-1 overflow-y-auto">{newMessageMode ? filteredPeople.map((person) => <button key={person.id} type="button" onClick={() => void startConversation(person)} className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-emerald-50/70 dark:hover:bg-muted/60"><ChatAvatar name={person.name} avatar={person.avatar} size="lg" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{person.name}</p><p className="text-xs capitalize text-muted-foreground">{person.role.replace(/_/g, ' ')}</p></div></button>) : visibleInboxEntries.map((entry) => {
          const latest = entry.latestMessage
          const isNetwork = entry.source === 'network'
          const subtitle = isNetwork ? entry.status === 'pending' ? entry.incoming ? 'Message request' : 'Request sent' : 'JibuSales Network' : 'Business chat'
          return <button key={`${entry.source}:${entry.id}`} type="button" onClick={() => isNetwork ? void loadNetworkMessages(entry) : void loadMessages(entry)} className="flex w-full items-center gap-3 border-b px-4 py-3 text-left hover:bg-muted/50">
            <ChatAvatar name={entry.participant.name} avatar={entry.participant.avatar} size="lg" />
            <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{entry.participant.name}</p><time className={cn('shrink-0 text-[11px]', entry.unreadCount ? 'font-medium text-emerald-800' : 'text-muted-foreground')}>{conversationTime(latest?.createdAt || entry.updatedAt)}</time></div>
              <div className="mt-1 flex items-center justify-between gap-2"><p className={cn('truncate text-xs', entry.unreadCount ? 'font-medium text-foreground' : 'text-muted-foreground')}>{latest?.body || (latest?.imageUrl ? '📷 Photo' : subtitle)}</p><div className="flex shrink-0 items-center gap-1.5">{isNetwork && <span className="text-[10px] text-muted-foreground">{subtitle}</span>}{entry.unreadCount > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-emerald-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">{entry.unreadCount}</span>}</div></div>
            </div>
          </button>
        })}
          {!newMessageMode && visibleInboxEntries.length === 0 && !peopleSearch && <div className="px-6 py-12 text-center"><MessageCircle className="mx-auto size-9 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">{inboxType === 'business' ? 'No business chats yet' : 'No JibuSales Network chats yet'}</p><p className="mt-1 text-xs text-muted-foreground">{inboxType === 'business' ? 'Business conversations stay separate from your JibuSales Network chats.' : 'Network conversations with other JibuSales businesses appear here.'}</p>{canSend ? <button type="button" onClick={() => inboxType === 'business' ? void openNewMessage() : setNetworkOpen(true)} className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-800 px-4 py-2 text-sm font-medium text-white">{inboxType === 'business' ? <><Plus className="size-4" />New business chat</> : <><Globe2 className="size-4" />Open JibuSales Network</>}</button> : <p className="mt-2 text-xs text-muted-foreground">Ask your business admin to grant “Send Team Messages” to discover contacts and start chats.</p>}</div>}
          {!newMessageMode && visibleInboxEntries.length === 0 && Boolean(peopleSearch) && <p className="px-5 py-8 text-center text-sm text-muted-foreground">No {inboxType === 'business' ? 'business' : 'JibuSales Network'} chats match your search.</p>}
          {newMessageMode && peopleLoading && <p role="status" className="px-5 py-8 text-center text-sm text-muted-foreground">Loading business contacts…</p>}
          {newMessageMode && !peopleLoading && filteredPeople.length === 0 && !error && <p className="px-5 py-8 text-center text-sm text-muted-foreground">{people.length ? 'No contacts match your search.' : 'No other active users are available in this business account.'}</p>}
        </div>
      </>}
      {error && <div role="alert" className="shrink-0 border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200">{error}</div>}
      </>}
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
