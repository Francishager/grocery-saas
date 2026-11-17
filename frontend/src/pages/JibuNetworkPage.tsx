import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Check, CheckCheck, ChevronLeft, Clock3, Copy, Flag, Globe2, LoaderCircle, MessageCircle, MoreVertical, Paperclip, PhoneCall, Plus, Search, Send, Settings, Share2, ShieldBan, UserRoundPlus, Users, X } from 'lucide-react'
import { apiFetch, authApi } from '@/lib/api'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Person = { id: string; name: string; avatar: string | null; jibuId: string }
type Profile = Partial<Person> & { countryCode: string | null; enabled: boolean }
type Chat = { id: string; status: 'pending' | 'accepted' | 'declined'; incoming: boolean; participant: Person; latestMessage: { id: string; senderId: string; body: string; imageUrl?: string | null; createdAt: string; deliveredAt: string | null; readAt: string | null } | null; updatedAt: string }
type Message = { id: string; senderId: string; body: string; imageUrl?: string | null; createdAt: string; deliveredAt: string | null; readAt: string | null }
type Update = { id: string; body: string; background: string; imageUrl?: string | null; createdAt: string; expiresAt: string; user: Person }
type MainTab = 'chats' | 'updates' | 'communities' | 'calls'
type CommunityTab = 'followers' | 'following'
type StatusMode = 'text' | 'photo'

const countryCodes = [
  ['+256', 'Uganda'], ['+254', 'Kenya'], ['+255', 'Tanzania'], ['+250', 'Rwanda'],
  ['+234', 'Nigeria'], ['+233', 'Ghana'], ['+27', 'South Africa'], ['+1', 'United States / Canada'],
  ['+44', 'United Kingdom'], ['+91', 'India'],
]
const statusColors = [
  ['emerald', 'bg-emerald-700'], ['blue', 'bg-blue-700'], ['rose', 'bg-rose-700'],
  ['amber', 'bg-amber-700'], ['violet', 'bg-violet-700'], ['slate', 'bg-slate-700'],
]

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`/api/network${path}`, init)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.')
  return data as T
}
const json = (value: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(value) })
const dateLabel = (value: string) => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

function Avatar({ person, size = 'md' }: { person?: Person | null; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'h-14 w-14 text-lg' : size === 'sm' ? 'h-9 w-9 text-xs' : 'h-11 w-11 text-sm'
  return person?.avatar
    ? <img src={person.avatar} alt="" className={`${sizeClass} rounded-full object-cover`} />
    : <div className={`${sizeClass} grid shrink-0 place-items-center rounded-full bg-emerald-100 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200`}>{person?.name?.slice(0, 1).toUpperCase() || '?'}</div>
}

function MessageTicks({ deliveredAt, readAt }: { deliveredAt?: string | null; readAt?: string | null }) {
  const Icon = deliveredAt ? CheckCheck : Check
  const label = readAt ? 'Read' : deliveredAt ? 'Delivered' : 'Sent; recipient has not received it yet'
  return <span className={`inline-flex shrink-0 ${readAt ? 'text-sky-500' : 'text-muted-foreground'}`} title={label} aria-label={label}><Icon className="h-4 w-4" /></span>
}

export default function JibuNetworkPage({ embedded = false, onClose }: { embedded?: boolean; onClose?: () => void } = {}) {
  const navigate = useNavigate()
  const { user, updateUser, hasPermission } = useJWTAuth()
  const canManageNetwork = user?.role === 'owner' || hasPermission('canSendTeamMessages')
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const messageImageInputRef = useRef<HTMLInputElement>(null)
  const sendingMessageRef = useRef(false)
  const pendingMessageRef = useRef<{ signature: string; id: string; file: File | null } | null>(null)
  const sendingRequestRef = useRef(false)
  const pendingRequestRef = useRef<{ signature: string; id: string } | null>(null)
  const [tab, setTab] = useState<MainTab>('chats')
  const [communityTab, setCommunityTab] = useState<CommunityTab>('followers')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [chats, setChats] = useState<Chat[]>([])
  const [contacts, setContacts] = useState<Person[]>([])
  const [contactFilter, setContactFilter] = useState('')
  const [updates, setUpdates] = useState<Update[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [following, setFollowing] = useState<Person[]>([])
  const [blocked, setBlocked] = useState<Person[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [countryCode, setCountryCode] = useState('+256')
  const [lookupId, setLookupId] = useState('')
  const [contactDraft, setContactDraft] = useState('')
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [foundPerson, setFoundPerson] = useState<Person | null>(null)
  const [intro, setIntro] = useState('')
  const [messageDraft, setMessageDraft] = useState('')
  const [messageImage, setMessageImage] = useState<File | null>(null)
  const [statusDraft, setStatusDraft] = useState('')
  const [statusImage, setStatusImage] = useState<File | null>(null)
  const [statusImagePreview, setStatusImagePreview] = useState('')
  const [statusImageError, setStatusImageError] = useState('')
  const [statusColor, setStatusColor] = useState('emerald')
  const [statusMode, setStatusMode] = useState<StatusMode>('text')
  const [menuOpen, setMenuOpen] = useState(false)
  const [viewingStatuses, setViewingStatuses] = useState<Update[]>([])
  const [viewingStatusIndex, setViewingStatusIndex] = useState(0)
  const [reportReason, setReportReason] = useState('spam')
  const [reportingPerson, setReportingPerson] = useState<Person | null>(null)

  useEffect(() => {
    if (!statusImage) { setStatusImagePreview(''); return }
    const preview = URL.createObjectURL(statusImage)
    setStatusImagePreview(preview)
    return () => URL.revokeObjectURL(preview)
  }, [statusImage])

  const loadProfile = useCallback(async () => {
    const result = await request<{ profile: Profile }>('/me')
    setProfile(result.profile)
    if (result.profile.countryCode) setCountryCode(result.profile.countryCode)
    return result.profile
  }, [])
  const loadLists = useCallback(async () => {
    const [chatResult, contactResult, updateResult, communityResult, followingResult, blockResult] = await Promise.allSettled([
      request<{ chats: Chat[]; unread: number }>('/chats'),
      request<{ contacts: Person[] }>('/contacts'),
      request<{ updates: Update[] }>('/updates'),
      request<{ people: Person[] }>(`/community/${communityTab}`),
      request<{ people: Person[] }>('/community/following'),
      request<{ people: Person[] }>('/blocks'),
    ])
    if (chatResult.status === 'rejected') throw chatResult.reason
    setChats(chatResult.value.chats)
    setUnreadCount(chatResult.value.unread)
    if (contactResult.status === 'fulfilled') setContacts(contactResult.value.contacts)
    if (updateResult.status === 'fulfilled') setUpdates(updateResult.value.updates)
    if (communityResult.status === 'fulfilled') setPeople(communityResult.value.people)
    if (followingResult.status === 'fulfilled') setFollowing(followingResult.value.people)
    if (blockResult.status === 'fulfilled') setBlocked(blockResult.value.people)
    return chatResult.value.chats
  }, [communityTab])
  const refresh = useCallback(async (initial = false) => {
    try {
      if (initial) setLoading(true)
      const currentProfile = await loadProfile()
      if (currentProfile.enabled) await loadLists()
      else {
        setChats([]); setContacts([]); setUpdates([]); setPeople([]); setFollowing([]); setBlocked([]); setUnreadCount(0)
      }
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load JibuSales Network.')
    } finally {
      if (initial) setLoading(false)
    }
  }, [loadLists, loadProfile])

  useEffect(() => { void refresh(true) }, [refresh])
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 30000)
    return () => window.clearInterval(timer)
  }, [refresh])
  useEffect(() => {
    if (!viewingStatuses.length) return
    const timer = window.setTimeout(() => {
      if (viewingStatusIndex + 1 < viewingStatuses.length) setViewingStatusIndex((index) => index + 1)
      else { setViewingStatuses([]); setViewingStatusIndex(0) }
    }, 6500)
    return () => window.clearTimeout(timer)
  }, [viewingStatuses, viewingStatusIndex])
  useEffect(() => {
    const selectedChatId = selectedChat?.id
    if (!selectedChatId) { setMessages([]); setMessageImage(null); pendingMessageRef.current = null; return }
    setMessageImage(null)
    setMessageDraft('')
    pendingMessageRef.current = null
    let active = true
    const load = async () => {
      try {
        const result = await request<{ messages: Message[]; status: Chat['status']; requestedById: string }>(`/chats/${selectedChatId}/messages`)
        if (active) {
          setMessages(result.messages)
          setSelectedChat((current) => {
            if (!current || current.id !== selectedChatId) return current
            const incoming = result.requestedById !== profile?.id
            return current.status === result.status && current.incoming === incoming
              ? current
              : { ...current, status: result.status, incoming }
          })
        }
      } catch (err) { if (active) setError(err instanceof Error ? err.message : 'Could not load this chat.') }
    }
    void load()
    const timer = window.setInterval(load, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [selectedChat?.id, profile?.id])

  const visibleChats = useMemo(() => chats.filter((chat) => chat.status !== 'declined'), [chats])
  const myStatuses = useMemo(() => updates.filter((update) => update.user.id === profile?.id), [updates, profile?.id])
  const followedStatuses = useMemo(() => updates.filter((update) => update.user.id !== profile?.id), [updates, profile?.id])
  const statusGroups = useMemo(() => {
    const grouped = new Map<string, Update[]>()
    for (const update of followedStatuses) grouped.set(update.user.id, [...(grouped.get(update.user.id) || []), update])
    return [...grouped.values()]
  }, [followedStatuses])
  const filteredContacts = useMemo(() => {
    const query = contactFilter.trim().toLocaleLowerCase()
    return contacts.filter((person) => !query || person.name.toLocaleLowerCase().includes(query) || person.jibuId.toLocaleLowerCase().includes(query))
  }, [contacts, contactFilter])
  const notify = (value: string) => { setNotice(value); window.setTimeout(() => setNotice(''), 3500) }
  const run = async (action: () => Promise<unknown>, success: string, allowWithoutSendPermission = false) => {
    if (!canManageNetwork && !allowWithoutSendPermission) {
      setError('Your administrator must grant Send Team Messages before you can use this action.')
      return
    }
    setBusy(true); setError('')
    try { await action(); notify(success); await refresh() }
    catch (err) { setError(err instanceof Error ? err.message : 'Action could not be completed.') }
    finally { setBusy(false) }
  }

  const enableNetwork = () => run(async () => {
    const result = await request<{ profile: Profile }>('/me', { method: 'PUT', body: JSON.stringify({ enabled: true, countryCode }) })
    setProfile(result.profile)
  }, 'Your JibuSales Network profile is ready.')
  const disableNetwork = () => run(async () => {
    const result = await request<{ profile: Profile }>('/me', { method: 'PUT', body: JSON.stringify({ enabled: false }) })
    setProfile({ ...(profile as Profile), ...result.profile, enabled: false })
  }, 'Your profile is hidden from cross-business discovery.', true)
  const uploadProfilePhoto = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) {
      setError('Choose an image no larger than 2 MB.')
      return
    }
    setUploadingAvatar(true)
    setError('')
    try {
      const result = await authApi.uploadAvatar(file)
      if (!result.avatar) throw new Error(result.error || 'Could not upload your profile photo.')
      updateUser({ avatar: result.avatar })
      setProfile(current => current ? { ...current, avatar: result.avatar } : current)
      notify('Profile photo updated.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload your profile photo.')
    } finally {
      setUploadingAvatar(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }
  const shareJibuId = async () => {
    if (!profile?.jibuId) return
    const text = `Find me on JibuSales Network: ${profile.jibuId}`
    try {
      if (navigator.share) await navigator.share({ title: 'JibuSales Network', text })
      else { await navigator.clipboard.writeText(text); notify('JibuSales ID copied for sharing.') }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      try { await navigator.clipboard.writeText(text); notify('JibuSales ID copied for sharing.') }
      catch { setError('Could not open sharing or copy your JibuSales ID.') }
    }
  }
  const copyJibuId = async () => {
    if (!profile?.jibuId) return
    try {
      await navigator.clipboard.writeText(profile.jibuId)
      notify('JibuSales ID copied.')
    } catch {
      setError('Could not copy your JibuSales ID. Use Share ID instead.')
    }
  }
  const findMember = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setFoundPerson(null)
    try { const result = await request<{ person: Person | null }>(`/lookup?id=${encodeURIComponent(lookupId)}`); setFoundPerson(result.person); if (!result.person) setError('No discoverable member found for that exact ID.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not search that ID.') }
    finally { setBusy(false) }
  }
  const sendRequest = () => {
    if (!foundPerson || sendingRequestRef.current) return
    sendingRequestRef.current = true
    const signature = JSON.stringify([foundPerson.jibuId, intro.trim()])
    const clientMessageId = pendingRequestRef.current?.signature === signature ? pendingRequestRef.current.id : crypto.randomUUID()
    pendingRequestRef.current = { signature, id: clientMessageId }
    void run(async () => {
      const result = await request<{ chatId: string; status: Chat['status']; existing?: boolean }>('/requests', json({ jibuId: foundPerson.jibuId, message: intro, clientMessageId }))
      setIntro(''); setLookupId(''); setFoundPerson(null); setNewChatOpen(false)
      const latestChats = await loadLists()
      const sentChat = latestChats.find((chat) => chat.id === result.chatId)
      if (!sentChat) throw new Error('The server accepted the request, but it did not return in your chat list. Refresh Chats and try again.')
      setTab('chats')
      setSelectedChat(sentChat)
      pendingRequestRef.current = null
    }, 'Message sent. The recipient can now find your request in Chats.').finally(() => { sendingRequestRef.current = false })
  }
  const removeContact = (person: Person) => run(() => request(`/contacts/${encodeURIComponent(person.jibuId)}`, { method: 'DELETE' }), 'Contact removed. Existing chat history is unchanged.')
  const addContactById = (event: FormEvent) => {
    event.preventDefault()
    const jibuId = contactDraft.trim()
    if (!jibuId) return
    void run(async () => {
      await request('/contacts', json({ jibuId }))
      setContactDraft('')
    }, 'Contact saved and synced to your JibuSales account.')
  }
  const messageContact = (person: Person) => {
    const existing = chats.find((chat) => chat.participant.id === person.id)
    if (existing?.status === 'accepted') { setSelectedChat(existing); return }
    if (existing?.status === 'pending') {
      setSelectedChat(existing)
      return
    }
    if (existing?.status === 'declined') { notify('This request was declined. The member must contact you to reopen the conversation.'); return }
    setFoundPerson(person)
    setIntro('')
    setNewChatOpen(true)
    notify('Write a short introduction to start a chat request.')
  }
  const sendMessage = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedChat || (!messageDraft.trim() && !messageImage) || sendingMessageRef.current) return
    sendingMessageRef.current = true
    setBusy(true); setError('')
    const body = messageDraft.trim()
    const signature = JSON.stringify([selectedChat.id, body, messageImage?.name, messageImage?.size, messageImage?.lastModified])
    const clientMessageId = pendingMessageRef.current?.signature === signature && pendingMessageRef.current.file === messageImage ? pendingMessageRef.current.id : crypto.randomUUID()
    pendingMessageRef.current = { signature, id: clientMessageId, file: messageImage }
    try {
      const payload = new FormData()
      payload.set('body', body)
      payload.set('clientMessageId', clientMessageId)
      if (messageImage) payload.set('image', messageImage)
      const { message } = await request<{ message: Message }>(`/chats/${selectedChat.id}/messages`, { method: 'POST', body: payload })
      setMessageDraft('')
      setMessageImage(null)
      if (messageImageInputRef.current) messageImageInputRef.current.value = ''
      pendingMessageRef.current = null
      setMessages((current) => current.some((row) => row.id === message.id) ? current.map((row) => row.id === message.id ? message : row) : [...current, message])
      setChats((current) => current.map((chat) => chat.id === selectedChat.id ? { ...chat, latestMessage: message, updatedAt: message.createdAt } : chat))
    } catch (err) { setError(err instanceof Error ? err.message : 'Message could not be sent.') }
    finally { sendingMessageRef.current = false; setBusy(false) }
  }
  const chooseMessageImage = (file?: File) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Choose a JPEG, PNG, or WebP image no larger than 5 MB.')
      if (messageImageInputRef.current) messageImageInputRef.current.value = ''
      return
    }
    setError('')
    setMessageImage(file)
    if (messageImageInputRef.current) messageImageInputRef.current.value = ''
  }
  const publishUpdate = () => run(async () => {
    const form = new FormData()
    form.set('body', statusDraft)
    form.set('background', statusColor)
    if (statusImage) form.set('image', statusImage)
    await request('/updates', { method: 'POST', body: form })
    setStatusDraft(''); setStatusImage(null); setStatusImageError('')
  }, 'Update posted. It will expire after 24 hours.')
  const lookupBlock = (person: Person) => run(async () => {
    await request('/blocks', json({ jibuId: person.jibuId })); setFoundPerson(null); setReportingPerson(null)
  }, 'Member blocked. They can no longer contact or follow you.')
  const submitReport = (person: Person) => run(async () => {
    await request('/reports', json({ jibuId: person.jibuId, reason: reportReason })); setReportingPerson(null)
  }, 'Safety report submitted for review.')
  const follow = (person: Person, isFollowing: boolean) => run(async () => {
    if (isFollowing) await request(`/community/follow/${encodeURIComponent(person.jibuId)}`, { method: 'DELETE' })
    else await request('/community/follow', json({ jibuId: person.jibuId }))
  }, isFollowing ? 'Unfollowed.' : 'Following member.')

  const settingsContent = <>
    <div className="space-y-5">
      <div className="flex items-center gap-4"><div className="relative"><Avatar person={{ id: profile?.id || '', name: profile?.name || user?.name || '', avatar: profile?.avatar || user?.avatar || null, jibuId: profile?.jibuId || '' }} size="lg" /><button type="button" title="Upload profile photo" aria-label="Upload profile photo" disabled={uploadingAvatar} onClick={() => avatarInputRef.current?.click()} className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border bg-background text-foreground shadow-sm hover:bg-muted">{uploadingAvatar ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}</button><input ref={avatarInputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void uploadProfilePhoto(event.target.files?.[0])} /></div><div className="min-w-0"><div className="truncate font-semibold">{user?.name || profile?.name || 'JibuSales user'}</div><div className="truncate text-sm text-muted-foreground">{user?.email || 'Email not available'}</div><div className="truncate text-sm text-muted-foreground">{user?.phone || ''}</div><p className="mt-1 text-xs text-muted-foreground">Photo up to 2 MB. Account name and contact details are managed in your account profile.</p></div></div>
      <div className="flex items-center gap-3 rounded-lg border p-3"><div className="min-w-0 flex-1"><div className="text-sm font-medium">JibuSales ID</div><div className="font-mono text-sm text-muted-foreground">{profile?.jibuId || 'Created when you opt in'}</div></div>{profile?.jibuId && <><Button variant="outline" size="icon" aria-label="Copy JibuSales ID" title="Copy JibuSales ID" onClick={() => void copyJibuId()}><Copy /></Button><Button variant="outline" size="icon" aria-label="Share JibuSales ID" title="Share JibuSales ID" onClick={() => void shareJibuId()}><Share2 /></Button></>}</div>
      {!profile?.enabled ? <div className="space-y-3"><label className="block text-sm font-medium">Country calling code<select className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-foreground" value={countryCode} onChange={event => setCountryCode(event.target.value)}>{countryCodes.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}</select></label><Button disabled={busy} onClick={() => void enableNetwork()}><UserRoundPlus className="mr-2 h-4 w-4" />Opt in and create ID</Button></div> : <div className="flex items-center justify-between gap-4 rounded-lg border p-3"><div><div className="text-sm font-medium">Network profile</div><p className="text-xs text-muted-foreground">Your profile is {profile.enabled ? 'discoverable by exact ID' : 'hidden'}.</p></div><Button variant="outline" disabled={busy} onClick={() => void disableNetwork()}>Turn off</Button></div>}
      <Button variant="outline" className="w-full justify-start" onClick={() => { setSettingsOpen(false); navigate('/tenant/profile') }}><UserRoundPlus className="mr-2 h-4 w-4" />Open account profile</Button>
    </div>
  </>

  if (loading) return <div className={`flex min-h-64 items-center justify-center text-muted-foreground ${embedded ? 'h-full' : ''}`}><LoaderCircle className="mr-2 h-5 w-5 animate-spin" />Loading Team Messaging</div>

  return <div className={`${embedded ? 'relative flex h-full min-h-0 flex-col overflow-hidden bg-background' : 'mx-auto w-full max-w-7xl space-y-5 px-3 pb-28 sm:px-6'}`}>
    <header className={`flex shrink-0 items-center justify-between gap-2 border-b pb-4 ${embedded ? 'flex-nowrap px-3 pt-3' : 'flex-wrap'}`}>
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 sm:h-11 sm:w-11"><Globe2 className="h-5 w-5" /></div><div className="min-w-0"><h1 className="truncate text-lg font-semibold sm:text-xl">Team Messaging</h1><p className="hidden truncate text-sm text-muted-foreground sm:block">Private business chats, with optional connections across JibuSales.</p></div></div>
      <div className="relative ml-auto flex shrink-0 items-center gap-1">{embedded && onClose && <Button variant="ghost" size="icon" aria-label="Back to private team chats" title="Back to private team chats" onClick={onClose}><ChevronLeft /></Button>}{profile?.enabled && <Button variant="ghost" size="icon" aria-label="Network menu" title="Network menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><MoreVertical className="h-5 w-5" /></Button>}{menuOpen && <div role="menu" className="absolute right-0 top-12 z-[130] w-56 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover py-1 text-popover-foreground shadow-2xl"><button type="button" role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setMenuOpen(false); setSettingsOpen(true) }}><Settings className="h-4 w-4" />Network settings</button><button type="button" role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setMenuOpen(false); navigate('/tenant/profile') }}><UserRoundPlus className="h-4 w-4" />Account profile</button></div>}</div>
    </header>

    <div className={`${embedded ? `flex min-h-0 flex-1 flex-col px-3 pb-20 pt-3 ${tab === 'chats' ? 'overflow-hidden' : 'overflow-y-auto'}` : 'space-y-5'}`}>

    {error && <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"><span>{error}</span><Button variant="ghost" size="icon-sm" aria-label="Dismiss error" onClick={() => setError('')}><X /></Button></div>}
    {notice && <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{notice}</div>}
    {!canManageNetwork && <div role="status" className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">You can view Team Messaging. Ask your administrator for “Send Team Messages” permission to opt in or start conversations.</div>}

    {!profile?.enabled ? <Card className="max-w-2xl"><CardHeader><CardTitle className="text-lg">Enable cross-business messaging</CardTitle><p className="text-sm text-muted-foreground">Your profile stays private until you opt in. Your JibuSales ID uses a country calling code and a random 10-digit number; it does not expose your phone number.</p></CardHeader><CardContent className="space-y-4"><label className="block text-sm font-medium">Country calling code<select className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-foreground sm:max-w-sm" value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>{countryCodes.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}</select></label><div className="flex flex-wrap items-center gap-3"><Button disabled={busy || !canManageNetwork} onClick={() => void enableNetwork()}><UserRoundPlus className="mr-2 h-4 w-4" />Opt in and create ID</Button><span className="text-xs text-muted-foreground">Only members who opt in can be found by exact ID.</span></div></CardContent></Card> : <>
      {tab === 'chats' && <div className={`${embedded ? 'flex min-h-0 flex-1 flex-col' : 'min-h-0'}`}>
        {selectedChat ? <Card className={`flex h-full flex-col overflow-hidden ${embedded ? 'min-h-0 flex-1' : 'min-h-[360px]'}`}>
          <CardHeader className="flex-row items-center gap-3 border-b px-4 py-3"><Button variant="ghost" size="icon-sm" aria-label="Back to chats" onClick={() => { setSelectedChat(null); setMessageImage(null) }}><ChevronLeft /></Button><Avatar person={selectedChat.participant} size="sm" /><div className="min-w-0 flex-1"><CardTitle className="text-base">{selectedChat.participant.name}</CardTitle><p className="text-xs text-muted-foreground">{selectedChat.status === 'pending' ? selectedChat.incoming ? 'Message request' : 'Request sent · waiting for acceptance' : 'JibuSales Network'}</p></div><Button variant="outline" size="icon-sm" title="Report member" disabled={!canManageNetwork} onClick={() => setReportingPerson(selectedChat.participant)}><Flag /></Button><Button variant="outline" size="icon-sm" title="Block member" disabled={!canManageNetwork} onClick={() => void lookupBlock(selectedChat.participant)}><ShieldBan /></Button></CardHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4">{messages.map((message) => { const own = message.senderId === profile.id; return <div key={message.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${own ? 'bg-emerald-700 text-white' : 'border bg-card'}`}>{message.imageUrl && <img src={message.imageUrl} alt="Shared image" className="mb-2 max-h-64 max-w-full rounded-lg object-contain" />}{message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}<div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${own ? 'text-emerald-100' : 'text-muted-foreground'}`}><time>{dateLabel(message.createdAt)}</time>{own && <MessageTicks deliveredAt={message.deliveredAt} readAt={message.readAt} />}</div></div></div> })}</div>
          {selectedChat.status === 'pending' && selectedChat.incoming ? <div className="shrink-0 border-t bg-muted/30 p-3"><p className="mb-2 text-center text-xs text-muted-foreground">Accept this request to continue the conversation.</p><div className="flex gap-2"><Button className="flex-1" disabled={busy || !canManageNetwork} onClick={() => void run(async () => { await request(`/chats/${selectedChat.id}/accept`, json({})); setSelectedChat((current) => current ? { ...current, status: 'accepted' } : current) }, 'Message request accepted.') }><Check className="mr-1.5 h-4 w-4" />Accept</Button><Button className="flex-1" variant="outline" disabled={busy || !canManageNetwork} onClick={() => void run(async () => { await request(`/chats/${selectedChat.id}/decline`, json({})); setSelectedChat(null) }, 'Message request declined.')}><X className="mr-1.5 h-4 w-4" />Decline</Button></div></div> : selectedChat.status === 'pending' ? <div className="shrink-0 border-t px-4 py-3 text-center text-xs text-muted-foreground">Your first message was sent. You can reply here after they accept.</div> : <form onSubmit={sendMessage} className="shrink-0 border-t p-3">
            {messageImage && <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs"><Paperclip className="h-4 w-4" /><span className="min-w-0 flex-1 truncate">{messageImage.name}</span><button type="button" aria-label="Remove attached image" onClick={() => setMessageImage(null)}><X className="h-4 w-4" /></button></div>}
            <input ref={messageImageInputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseMessageImage(event.target.files?.[0])} />
            <div className="flex items-end gap-2"><Button type="button" variant="ghost" size="icon" aria-label="Attach image" onClick={() => messageImageInputRef.current?.click()}><Paperclip /></Button><Textarea aria-label="Message" placeholder="Write a message" rows={2} maxLength={4000} value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} /><Button type="submit" size="icon" disabled={busy || !canManageNetwork || (!messageDraft.trim() && !messageImage)} aria-label="Send message"><Send /></Button></div>
          </form>}
        </Card> : <div className={`${embedded ? 'h-full min-h-0 flex-1' : 'h-full'} overflow-y-auto rounded-lg border bg-card`}><div className="border-b px-4 py-3"><h2 className="font-semibold">Chats</h2><p className="text-xs text-muted-foreground">Private conversations and new message requests.</p></div>{visibleChats.length === 0 ? <div className="grid min-h-56 place-items-center px-6 text-center"><div><MessageCircle className="mx-auto mb-3 h-9 w-9 text-muted-foreground/50" /><p className="font-medium">No conversations yet</p><p className="mt-1 text-sm text-muted-foreground">Start a chat with a JibuSales ID using the new chat button.</p></div></div> : <div className="divide-y">{visibleChats.map((chat) => <button key={chat.id} type="button" onClick={() => setSelectedChat(chat)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60"><Avatar person={chat.participant} size="sm" /><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate text-sm font-medium">{chat.participant.name}</span>{chat.status === 'pending' && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">{chat.incoming ? 'New message' : 'Request sent'}</span>}</span><span className="mt-0.5 flex items-center gap-1.5"><span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{chat.latestMessage?.body || (chat.latestMessage?.imageUrl ? '📷 Photo' : 'Start the conversation')}</span>{chat.latestMessage?.senderId === profile.id && <MessageTicks deliveredAt={chat.latestMessage.deliveredAt} readAt={chat.latestMessage.readAt} />}</span></span><time className="shrink-0 text-[10px] text-muted-foreground">{dateLabel(chat.latestMessage?.createdAt || chat.updatedAt)}</time></button>)}</div>}</div>}
      </div>}

      {tab === 'updates' && <div className={`${embedded ? 'space-y-4' : 'grid gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.5fr)]'}`}>
        <section className="rounded-lg border bg-card p-4"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Status</h2><span className="text-xs text-muted-foreground">Expires after 24 hours</span></div><div className="flex gap-4 overflow-x-auto pb-2">
          <button type="button" className="flex w-16 shrink-0 flex-col items-center gap-1.5" onClick={() => myStatuses.length ? (setViewingStatuses(myStatuses), setViewingStatusIndex(0)) : document.getElementById('network-status-composer')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} aria-label={myStatuses.length ? 'View your status' : 'Add a status'}><span className={`relative grid h-14 w-14 place-items-center rounded-full border-2 p-1 ${myStatuses.length ? 'border-emerald-500' : 'border-dashed border-muted-foreground/50'}`}><Avatar person={profile} size="sm" />{!myStatuses.length && <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border-2 border-card bg-emerald-700 text-white"><Plus className="h-3.5 w-3.5" /></span>}</span><span className="w-full truncate text-center text-[11px] font-medium">My status</span></button>
          {statusGroups.map((group) => { const person = group[0].user; return <button key={person.id} type="button" className="flex w-16 shrink-0 flex-col items-center gap-1.5" onClick={() => { setViewingStatuses(group); setViewingStatusIndex(0) }} aria-label={`View ${person.name}'s status`}><span className="grid h-14 w-14 place-items-center rounded-full border-2 border-emerald-500 p-1"><Avatar person={person} size="sm" /></span><span className="w-full truncate text-center text-[11px]">{person.name}</span></button> })}
        </div>{myStatuses.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Your status is visible here until its 24-hour expiry.</p>}</section>
        <Card id="network-status-composer"><CardHeader><CardTitle className="text-base">Share a status</CardTitle><p className="text-sm text-muted-foreground">Choose one: a text update or a photo.</p></CardHeader><CardContent className="space-y-3"><div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1"><button type="button" aria-pressed={statusMode === 'text'} onClick={() => { setStatusMode('text'); setStatusImage(null); setStatusImageError('') }} className={`min-h-10 rounded-md text-sm font-medium ${statusMode === 'text' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>Text</button><button type="button" aria-pressed={statusMode === 'photo'} onClick={() => { setStatusMode('photo'); setStatusDraft(''); setStatusImageError('') }} className={`min-h-10 rounded-md text-sm font-medium ${statusMode === 'photo' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>Photo</button></div>{statusMode === 'text' ? <><div className={`rounded-lg p-3 ${statusColors.find(([color]) => color === statusColor)?.[1] || 'bg-emerald-700'}`}><Textarea aria-label="Text status" maxLength={500} rows={4} placeholder="Type a status update" value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)} className="resize-none border-0 bg-transparent text-center text-lg font-medium text-white placeholder:text-white/70 focus-visible:ring-white/60" /></div><div className="flex items-center gap-2">{statusColors.map(([color, className]) => <button key={color} type="button" aria-label={`${color} background`} aria-pressed={statusColor === color} onClick={() => setStatusColor(color)} className={`h-7 w-7 rounded-full ${className} ${statusColor === color ? 'ring-2 ring-foreground ring-offset-2' : ''}`} />)}<span className="ml-auto text-xs text-muted-foreground">{statusDraft.length}/500</span></div></> : <><label className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center text-sm text-muted-foreground hover:bg-muted/50"><Camera className="h-7 w-7" /><span>{statusImage ? 'Choose a different photo' : 'Choose one photo for your status'}</span><span className="text-xs">JPEG, PNG, or WebP · up to 5 MB</span><Input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0] || null; setStatusImageError(file && file.size > 5 * 1024 * 1024 ? 'Image must be 5 MB or smaller.' : file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ? 'Choose a JPEG, PNG, or WebP image.' : ''); setStatusImage(file && file.size <= 5 * 1024 * 1024 && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ? file : null) }} /></label>{statusImageError && <p role="alert" className="text-sm text-destructive">{statusImageError}</p>}{statusImagePreview && <div className="relative"><img src={statusImagePreview} alt="Photo status preview" className="max-h-72 w-full rounded-lg object-contain bg-muted" /><Button type="button" variant="secondary" size="icon-sm" className="absolute right-2 top-2" aria-label="Remove selected photo" onClick={() => setStatusImage(null)}><X /></Button></div>}</>}<Button disabled={busy || Boolean(statusImageError) || (statusMode === 'text' ? !statusDraft.trim() : !statusImage)} onClick={() => void publishUpdate()}><Send className="mr-2 h-4 w-4" />Post status</Button></CardContent></Card>
      </div>}

      {tab === 'communities' && <div className={`${embedded ? 'space-y-4' : 'grid gap-4 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.5fr)]'}`}><div className="space-y-4"><Card><CardHeader><CardTitle className="text-base">Find a community member</CardTitle><p className="text-sm text-muted-foreground">Find by exact JibuSales ID; phone numbers and business records stay private.</p></CardHeader><CardContent><form onSubmit={findMember} className="flex gap-2"><Input aria-label="JibuSales ID" placeholder="Enter exact JibuSales ID" value={lookupId} onChange={(event) => setLookupId(event.target.value)} /><Button type="submit" size="icon" disabled={busy} aria-label="Search ID">{busy ? <LoaderCircle className="animate-spin" /> : <Search />}</Button></form>{foundPerson && <div className="mt-4 rounded-lg border p-3"><div className="flex items-center gap-3"><Avatar person={foundPerson} /><div className="min-w-0 flex-1"><div className="truncate font-medium">{foundPerson.name}</div><div className="text-xs text-muted-foreground">JibuSales member</div></div></div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => void follow(foundPerson, following.some((person) => person.id === foundPerson.id))}>{following.some((person) => person.id === foundPerson.id) ? 'Unfollow' : 'Follow'}</Button><Button size="sm" variant="outline" onClick={() => setReportingPerson(foundPerson)}><Flag className="mr-1.5 h-3.5 w-3.5" />Report</Button><Button size="sm" variant="outline" onClick={() => void lookupBlock(foundPerson)}><ShieldBan className="mr-1.5 h-3.5 w-3.5" />Block</Button></div></div>}</CardContent></Card><Card><CardHeader className="pb-2"><CardTitle className="text-base">Contacts</CardTitle><p className="text-sm text-muted-foreground">Save members here to find them again and start chats.</p></CardHeader><CardContent className="space-y-3"><form onSubmit={addContactById} className="flex gap-2"><Input aria-label="Add contact by JibuSales ID" placeholder="Enter JibuSales ID" value={contactDraft} onChange={(event) => setContactDraft(event.target.value)} /><Button type="submit" disabled={busy || !canManageNetwork || !contactDraft.trim()}><UserRoundPlus className="mr-1.5 h-4 w-4" />Add</Button></form><Input aria-label="Search contacts" placeholder="Search saved contacts" value={contactFilter} onChange={(event) => setContactFilter(event.target.value)} />{filteredContacts.length === 0 ? <p className="py-3 text-center text-sm text-muted-foreground">{contacts.length ? 'No contacts match your search.' : 'No saved contacts yet.'}</p> : <div className="max-h-52 divide-y overflow-y-auto">{filteredContacts.map((person) => <div key={person.id} className="flex items-center gap-2 py-2"><Avatar person={person} size="sm" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{person.name}</span><Button size="icon-sm" variant="ghost" title={`Message ${person.name}`} aria-label={`Message ${person.name}`} onClick={() => messageContact(person)}><MessageCircle /></Button><Button size="icon-sm" variant="ghost" title={`Remove ${person.name}`} aria-label={`Remove ${person.name}`} disabled={busy || !canManageNetwork} onClick={() => void removeContact(person)}><X /></Button></div>)}</div>}</CardContent></Card></div><div className="space-y-3"><div className="flex gap-2 border-b pb-2"><Button variant={communityTab === 'following' ? 'secondary' : 'ghost'} onClick={() => setCommunityTab('following')}>Following</Button><Button variant={communityTab === 'followers' ? 'secondary' : 'ghost'} onClick={() => setCommunityTab('followers')}><Users className="mr-2 h-4 w-4" />Followers</Button></div>{people.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No {communityTab} yet.</CardContent></Card> : <Card><CardContent className="divide-y p-2">{people.map((person) => <div key={person.id} className="flex items-center gap-3 p-3"><Avatar person={person} size="sm" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{person.name}</div></div>{communityTab === 'following' && <Button size="sm" variant="outline" onClick={() => void follow(person, true)}>Unfollow</Button>}</div>)}</CardContent></Card>}{blocked.length > 0 && <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Blocked members</CardTitle></CardHeader><CardContent className="space-y-2">{blocked.map((person) => <div key={person.id} className="flex items-center gap-3"><Avatar person={person} size="sm" /><span className="min-w-0 flex-1 truncate text-sm">{person.name}</span><Button size="sm" variant="outline" onClick={() => void run(() => request(`/blocks/${encodeURIComponent(person.jibuId)}`, { method: 'DELETE' }), 'Member unblocked.')}>Unblock</Button></div>)}</CardContent></Card>}</div></div>}

      {tab === 'calls' && <Card className="mx-auto max-w-2xl"><CardContent className="grid justify-items-center py-16 text-center"><PhoneCall className="mb-4 h-10 w-10 text-muted-foreground" /><h2 className="font-semibold">Calls are not available yet</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">Calling is not enabled in JibuSales Network yet. Your chats and updates are ready to use.</p></CardContent></Card>}

      {!embedded && <div className="border-t pt-4"><p className="text-xs text-muted-foreground">Cross-business discovery is optional. Your JibuSales ID is not your phone number.</p></div>}
    </>}
    </div>

    {profile?.enabled && canManageNetwork && tab === 'chats' && !selectedChat && <Button className={`${embedded ? 'absolute bottom-[4.5rem] right-4' : 'fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-5'} z-40 h-14 w-14 rounded-full bg-emerald-700 text-white shadow-lg hover:bg-emerald-800`} aria-label="New chat" title="New chat" onClick={() => { setFoundPerson(null); setLookupId(''); setIntro(''); setNewChatOpen(true) }}><Plus className="h-6 w-6" /></Button>}
    {profile?.enabled && canManageNetwork && <>
      <nav aria-label="Network navigation" className={`${embedded ? 'absolute inset-x-0 bottom-0' : 'fixed inset-x-0 bottom-0 md:left-64'} z-30 border-t bg-background/95 px-2 pt-2 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur supports-[backdrop-filter]:bg-background/85`} style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)' }}>
        <div className="mx-auto grid max-w-xl grid-cols-4">
          {([['chats', MessageCircle, 'Chats'], ['updates', Clock3, 'Status'], ['communities', Users, 'Communities'], ['calls', PhoneCall, 'Calls']] as const).map(([key, Icon, label]) => <button key={key} type="button" aria-current={tab === key ? 'page' : undefined} onClick={() => { setTab(key); setSelectedChat(null) }} className={`relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md text-xs ${tab === key ? 'font-semibold text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground hover:bg-muted'}`}><span className="relative"><Icon className="h-5 w-5" />{key === 'chats' && unreadCount > 0 && <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-emerald-700 px-1 text-[9px] text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}</span>{label}</button>)}
        </div>
      </nav>
    </>}

    {viewingStatuses.length > 0 && viewingStatuses[viewingStatusIndex] && <div className={`${embedded ? 'absolute inset-0 z-[115]' : 'fixed inset-0 z-[115]'} flex flex-col bg-black text-white`}><div className="flex gap-1 px-3 pt-3">{viewingStatuses.map((status, index) => <span key={status.id} className="h-1 flex-1 rounded-full bg-white/30"><span className={`block h-full rounded-full ${index <= viewingStatusIndex ? 'bg-white' : ''}`} /></span>)}</div><header className="flex items-center gap-3 px-3 py-4"><Avatar person={viewingStatuses[viewingStatusIndex].user} size="sm" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{viewingStatuses[viewingStatusIndex].user.id === profile?.id ? 'My status' : viewingStatuses[viewingStatusIndex].user.name}</div><div className="text-xs text-white/70">{dateLabel(viewingStatuses[viewingStatusIndex].createdAt)} · expires {dateLabel(viewingStatuses[viewingStatusIndex].expiresAt)}</div></div>{viewingStatuses[viewingStatusIndex].user.id === profile?.id && <Button variant="ghost" size="icon" aria-label="Delete status" className="text-white hover:bg-white/15 hover:text-white" onClick={() => void run(async () => { await request(`/updates/${viewingStatuses[viewingStatusIndex].id}`, { method: 'DELETE' }); setViewingStatuses([]); setViewingStatusIndex(0) }, 'Status deleted.')}><X /></Button>}<Button variant="ghost" size="icon" aria-label="Close status" className="text-white hover:bg-white/15 hover:text-white" onClick={() => { setViewingStatuses([]); setViewingStatusIndex(0) }}><X /></Button></header><button type="button" className={`grid min-h-0 flex-1 place-items-center overflow-hidden px-4 pb-6 text-center ${viewingStatuses[viewingStatusIndex].imageUrl ? 'bg-black' : statusColors.find(([color]) => color === viewingStatuses[viewingStatusIndex].background)?.[1] || 'bg-emerald-700'}`} onClick={() => setViewingStatusIndex((index) => index + 1 < viewingStatuses.length ? index + 1 : 0)}>{viewingStatuses[viewingStatusIndex].imageUrl ? <img src={viewingStatuses[viewingStatusIndex].imageUrl || ''} alt="Status" className="max-h-full max-w-full object-contain" /> : <span className="max-w-xl whitespace-pre-wrap break-words text-2xl font-semibold">{viewingStatuses[viewingStatusIndex].body}</span>}</button></div>}

    {newChatOpen && <div className={`${embedded ? 'absolute inset-0 z-[110]' : 'fixed inset-0 z-[110]'} flex flex-col bg-background`}><header className="flex h-14 shrink-0 items-center gap-2 border-b px-3"><Button variant="ghost" size="icon" aria-label="Back" onClick={() => { setNewChatOpen(false); setFoundPerson(null) }}><ChevronLeft /></Button><h2 className="flex-1 font-semibold">New chat</h2><Button variant="ghost" size="icon" aria-label="Close new chat" onClick={() => { setNewChatOpen(false); setFoundPerson(null) }}><X /></Button></header><div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"><p className="text-sm text-muted-foreground">Find someone by their exact JibuSales ID. They must accept your first message before you can chat.</p><form onSubmit={findMember} className="flex gap-2"><Input aria-label="JibuSales ID" autoFocus placeholder="Enter JibuSales ID" value={lookupId} onChange={event => setLookupId(event.target.value)} /><Button type="submit" size="icon" disabled={busy || !lookupId.trim()} aria-label="Find member">{busy ? <LoaderCircle className="animate-spin" /> : <Search />}</Button></form>{foundPerson && <div className="space-y-3 rounded-lg border p-4"><div className="flex items-center gap-3"><Avatar person={foundPerson} /><div className="min-w-0"><div className="truncate font-medium">{foundPerson.name}</div><div className="text-xs text-muted-foreground">JibuSales member</div></div></div><Textarea aria-label="First message" maxLength={500} rows={3} placeholder="Introduce yourself" value={intro} onChange={event => setIntro(event.target.value)} /><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => void lookupBlock(foundPerson)}><ShieldBan className="mr-2 h-4 w-4" />Block</Button><Button disabled={busy || !intro.trim()} onClick={() => void sendRequest()}><Send className="mr-2 h-4 w-4" />Send request</Button></div></div>}</div></div>}

    {embedded ? settingsOpen && <div className="absolute inset-0 z-[125] grid place-items-center bg-black/45 p-3" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="network-settings-title" className="relative max-h-full w-full max-w-lg overflow-y-auto rounded-xl border bg-background p-5 pr-12 shadow-2xl"><Button variant="ghost" size="icon-sm" aria-label="Close Team Messaging settings" className="absolute right-2 top-2" onClick={() => setSettingsOpen(false)}><X /></Button><h2 id="network-settings-title" className="mb-1 text-base font-semibold">Team Messaging settings</h2><p className="mb-5 text-sm text-muted-foreground">Manage your profile and optional cross-business discovery.</p>{settingsContent}</section></div> : <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Team Messaging settings</DialogTitle><DialogDescription>Manage your profile and optional cross-business discovery.</DialogDescription></DialogHeader>{settingsContent}</DialogContent></Dialog>}

    {reportingPerson && <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReportingPerson(null) }}><section role="dialog" aria-modal="true" aria-labelledby="network-report-title" className="w-full max-w-md rounded-lg border bg-background p-5 shadow-xl"><div className="flex items-center justify-between"><h2 id="network-report-title" className="font-semibold">Report {reportingPerson.name}</h2><Button variant="ghost" size="icon-sm" aria-label="Close report" onClick={() => setReportingPerson(null)}><X /></Button></div><p className="mt-2 text-sm text-muted-foreground">Reports are submitted to JibuSales for review.</p><label className="mt-4 block text-sm">Reason<select className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="impersonation">Impersonation</option><option value="inappropriate">Inappropriate content</option><option value="other">Other</option></select></label><div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setReportingPerson(null)}>Cancel</Button><Button disabled={busy} onClick={() => void submitReport(reportingPerson)}><Flag className="mr-2 h-4 w-4" />Submit report</Button></div></section></div>}
  </div>
}
