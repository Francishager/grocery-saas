import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Check, ChevronLeft, Clock3, Flag, Globe2, LoaderCircle, MessageCircle, MoreVertical, PhoneCall, Plus, Search, Send, Settings, Share2, ShieldBan, UserRoundPlus, Users, X } from 'lucide-react'
import { apiFetch, authApi } from '@/lib/api'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

type Person = { id: string; name: string; avatar: string | null; jibuId: string }
type Profile = Partial<Person> & { countryCode: string | null; enabled: boolean }
type Chat = { id: string; status: 'pending' | 'accepted' | 'declined'; incoming: boolean; participant: Person; latestMessage: { body: string; createdAt: string } | null; updatedAt: string }
type Message = { id: string; senderId: string; body: string; createdAt: string; readAt: string | null }
type Update = { id: string; body: string; background: string; imageUrl?: string | null; createdAt: string; expiresAt: string; user: Person }
type MainTab = 'chats' | 'updates' | 'communities' | 'calls'
type CommunityTab = 'followers' | 'following'

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

export default function JibuNetworkPage() {
  const navigate = useNavigate()
  const { user, updateUser } = useJWTAuth()
  const avatarInputRef = useRef<HTMLInputElement>(null)
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
  const [statusDraft, setStatusDraft] = useState('')
  const [statusImage, setStatusImage] = useState<File | null>(null)
  const [statusImagePreview, setStatusImagePreview] = useState('')
  const [statusImageError, setStatusImageError] = useState('')
  const [statusColor, setStatusColor] = useState('emerald')
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
  }, [])
  const loadLists = useCallback(async () => {
    const [chatResult, contactResult, updateResult, communityResult, followingResult, blockResult] = await Promise.all([
      request<{ chats: Chat[]; unread: number }>('/chats'),
      request<{ contacts: Person[] }>('/contacts'),
      request<{ updates: Update[] }>('/updates'),
      request<{ people: Person[] }>(`/community/${communityTab}`),
      request<{ people: Person[] }>('/community/following'),
      request<{ people: Person[] }>('/blocks'),
    ])
    setChats(chatResult.chats)
    setContacts(contactResult.contacts)
    setUnreadCount(chatResult.unread)
    setUpdates(updateResult.updates)
    setPeople(communityResult.people)
    setFollowing(followingResult.people)
    setBlocked(blockResult.people)
  }, [communityTab])
  const refresh = useCallback(async (initial = false) => {
    try {
      if (initial) setLoading(true)
      await Promise.all([loadProfile(), loadLists()])
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
    if (!selectedChat) { setMessages([]); return }
    let active = true
    const load = async () => {
      try {
        const result = await request<{ messages: Message[]; status: Chat['status'] }>(`/chats/${selectedChat.id}/messages`)
        if (active) setMessages(result.messages)
      } catch (err) { if (active) setError(err instanceof Error ? err.message : 'Could not load this chat.') }
    }
    void load()
    const timer = window.setInterval(load, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [selectedChat])

  const incoming = useMemo(() => chats.filter((chat) => chat.status === 'pending' && chat.incoming), [chats])
  const activeChats = useMemo(() => chats.filter((chat) => chat.status === 'accepted'), [chats])
  const filteredContacts = useMemo(() => {
    const query = contactFilter.trim().toLocaleLowerCase()
    return contacts.filter((person) => !query || person.name.toLocaleLowerCase().includes(query) || person.jibuId.toLocaleLowerCase().includes(query))
  }, [contacts, contactFilter])
  const notify = (value: string) => { setNotice(value); window.setTimeout(() => setNotice(''), 3500) }
  const run = async (action: () => Promise<unknown>, success: string) => {
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
  }, 'Your profile is hidden from Network discovery.')
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
  const findMember = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setFoundPerson(null)
    try { const result = await request<{ person: Person | null }>(`/lookup?id=${encodeURIComponent(lookupId)}`); setFoundPerson(result.person); if (!result.person) setError('No discoverable member found for that exact ID.') }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not search that ID.') }
    finally { setBusy(false) }
  }
  const sendRequest = () => foundPerson && run(async () => {
    const result = await request<{ chatId: string; status: Chat['status']; existing?: boolean }>('/requests', json({ jibuId: foundPerson.jibuId, message: intro }))
    setIntro(''); setLookupId(''); setFoundPerson(null); setNewChatOpen(false); await refresh()
    if (result.status === 'accepted') setSelectedChat(chats.find((chat) => chat.id === result.chatId) || null)
  }, 'Message request sent.')
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
      notify(existing.incoming ? 'Accept this member’s message request before chatting.' : 'Your message request is waiting for acceptance.')
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
    if (!selectedChat || !messageDraft.trim()) return
    setBusy(true); setError('')
    try {
      await request(`/chats/${selectedChat.id}/messages`, json({ body: messageDraft }))
      setMessageDraft('')
      const result = await request<{ messages: Message[] }>(`/chats/${selectedChat.id}/messages`)
      setMessages(result.messages); await loadLists()
    } catch (err) { setError(err instanceof Error ? err.message : 'Message could not be sent.') }
    finally { setBusy(false) }
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

  if (loading) return <div className="flex min-h-64 items-center justify-center text-muted-foreground"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" />Loading Network</div>

  return <div className="mx-auto w-full max-w-7xl space-y-5 px-3 pb-28 sm:px-6">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
      <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"><Globe2 className="h-5 w-5" /></div><div><h1 className="text-xl font-semibold">JibuSales Network</h1><p className="text-sm text-muted-foreground">Connect across businesses, on your terms.</p></div></div>
      <div className="flex items-center gap-2">{profile?.enabled && profile.jibuId && <div className="hidden items-center gap-2 rounded-lg border px-3 py-2 text-sm sm:flex"><span className="text-muted-foreground">Your ID</span><strong className="font-mono">{profile.jibuId}</strong></div>}<DropdownMenu><DropdownMenuTrigger aria-label="Network menu" title="Network menu" className="h-10 w-10 rounded-full border bg-background text-foreground hover:bg-muted"><MoreVertical className="h-5 w-5" /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56"><DropdownMenuItem onClick={() => setSettingsOpen(true)}><Settings className="mr-2 inline h-4 w-4" />Network settings</DropdownMenuItem>{profile?.jibuId && <DropdownMenuItem onClick={() => void shareJibuId()}><Share2 className="mr-2 inline h-4 w-4" />Share my JibuSales ID</DropdownMenuItem>}<DropdownMenuItem onClick={() => navigate('/tenant/profile')}><UserRoundPlus className="mr-2 inline h-4 w-4" />Account profile</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
    </header>

    {error && <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"><span>{error}</span><Button variant="ghost" size="icon-sm" aria-label="Dismiss error" onClick={() => setError('')}><X /></Button></div>}
    {notice && <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{notice}</div>}

    {!profile?.enabled ? <Card className="max-w-2xl"><CardHeader><CardTitle className="text-lg">Set up your Network profile</CardTitle><p className="text-sm text-muted-foreground">Your profile is private until you opt in. Your JibuSales ID uses a country calling code and a random 10-digit number; it does not expose your phone number.</p></CardHeader><CardContent className="space-y-4"><label className="block text-sm font-medium">Country calling code<select className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-foreground sm:max-w-sm" value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>{countryCodes.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}</select></label><div className="flex flex-wrap items-center gap-3"><Button disabled={busy} onClick={() => void enableNetwork()}><UserRoundPlus className="mr-2 h-4 w-4" />Opt in and create ID</Button><span className="text-xs text-muted-foreground">Only members who opt in can be found by exact ID.</span></div></CardContent></Card> : <>
      {tab === 'chats' && <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.5fr)]">
        <div className="space-y-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Message requests <span className="text-muted-foreground">{incoming.length}</span></CardTitle></CardHeader><CardContent className="space-y-3">{incoming.length === 0 ? <p className="text-sm text-muted-foreground">No new requests.</p> : incoming.map((chat) => <div key={chat.id} className="flex items-center gap-3 border-b pb-3 last:border-0 last:pb-0"><Avatar person={chat.participant} size="sm" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{chat.participant.name}</div><p className="truncate text-xs text-muted-foreground">{chat.latestMessage?.body}</p></div><Button size="icon-sm" title="Accept request" onClick={() => void run(async () => { await request(`/chats/${chat.id}/accept`, json({})); setSelectedChat(chat) }, 'Chat request accepted.')}><Check /></Button><Button size="icon-sm" variant="outline" title="Decline request" onClick={() => void run(() => request(`/chats/${chat.id}/decline`, json({})), 'Request declined.')}><X /></Button></div>)}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Sent requests</CardTitle></CardHeader><CardContent className="space-y-2">{chats.filter((chat) => chat.status === 'pending' && !chat.incoming).length === 0 ? <p className="text-sm text-muted-foreground">No pending requests sent.</p> : chats.filter((chat) => chat.status === 'pending' && !chat.incoming).map((chat) => <div key={chat.id} className="flex items-center gap-3"><Avatar person={chat.participant} size="sm" /><span className="min-w-0 flex-1 truncate text-sm">{chat.participant.name}</span><span className="text-xs text-muted-foreground">Waiting for acceptance</span></div>)}</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Chats</CardTitle></CardHeader><CardContent className="space-y-1 p-2 pt-0">{activeChats.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">Accepted chats will appear here.</p> : activeChats.map((chat) => <button key={chat.id} onClick={() => setSelectedChat(chat)} className={`flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-muted ${selectedChat?.id === chat.id ? 'bg-muted' : ''}`}><Avatar person={chat.participant} size="sm" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{chat.participant.name}</span><span className="block truncate text-xs text-muted-foreground">{chat.latestMessage?.body || 'Start the conversation'}</span></span></button>)}</CardContent></Card>
        </div>
        <Card className="flex min-h-[420px] flex-col overflow-hidden">{selectedChat ? <><CardHeader className="flex-row items-center gap-3 border-b px-4 py-3"><Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Back to chats" onClick={() => setSelectedChat(null)}><ChevronLeft /></Button><Avatar person={selectedChat.participant} size="sm" /><div className="min-w-0 flex-1"><CardTitle className="text-base">{selectedChat.participant.name}</CardTitle><p className="font-mono text-xs text-muted-foreground">{selectedChat.participant.jibuId}</p></div><Button variant="outline" size="icon-sm" title="Report member" onClick={() => setReportingPerson(selectedChat.participant)}><Flag /></Button><Button variant="outline" size="icon-sm" title="Block member" onClick={() => void lookupBlock(selectedChat.participant)}><ShieldBan /></Button></CardHeader><div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4">{messages.map((message) => <div key={message.id} className={`flex ${message.senderId === profile.id ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${message.senderId === profile.id ? 'bg-emerald-700 text-white' : 'border bg-card'}`}><p className="whitespace-pre-wrap break-words">{message.body}</p><div className={`mt-1 text-[10px] ${message.senderId === profile.id ? 'text-emerald-100' : 'text-muted-foreground'}`}>{dateLabel(message.createdAt)}{message.senderId === profile.id && message.readAt ? ' · Read' : ''}</div></div></div>)}</div><form onSubmit={sendMessage} className="flex items-end gap-2 border-t p-3"><Textarea aria-label="Message" placeholder="Write a message" rows={2} maxLength={4000} value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} /><Button type="submit" size="icon" disabled={busy || !messageDraft.trim()} aria-label="Send message"><Send /></Button></form></> : <div className="grid flex-1 place-items-center p-8 text-center"><div><MessageCircle className="mx-auto mb-3 h-10 w-10 text-emerald-700" /><h2 className="font-semibold">Your conversations, across businesses</h2><p className="mt-1 max-w-sm text-sm text-muted-foreground">Choose a chat or find a member by exact JibuSales ID. New contacts must accept your request first.</p></div></div>}</Card>
      </div>}

      {tab === 'chats' && <Card><CardHeader className="pb-3"><CardTitle className="text-base">Business contacts</CardTitle><p className="text-sm text-muted-foreground">Add an opted-in JibuSales member by exact ID. Contacts and conversations sync to your account on other devices.</p></CardHeader><CardContent className="grid gap-5 lg:grid-cols-[minmax(260px,0.7fr)_minmax(0,1.3fr)]"><form onSubmit={addContactById} className="flex items-start gap-2"><div className="min-w-0 flex-1"><Input aria-label="Contact JibuSales ID" placeholder="+256012345678" value={contactDraft} onChange={event => setContactDraft(event.target.value)} /><p className="mt-1 text-xs text-muted-foreground">Phone numbers are not shared.</p></div><Button type="submit" disabled={busy || !contactDraft.trim()}><UserRoundPlus className="mr-2 h-4 w-4" />Add contact</Button></form><div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Saved contacts <span className="text-muted-foreground">{contacts.length}</span></h3><Input className="w-full sm:max-w-xs" aria-label="Search saved contacts" placeholder="Search name or ID" value={contactFilter} onChange={event => setContactFilter(event.target.value)} /></div>{filteredContacts.length === 0 ? <p className="py-3 text-sm text-muted-foreground">{contacts.length ? 'No contacts match your search.' : 'Your saved contacts will appear here.'}</p> : <div className="max-h-72 divide-y overflow-y-auto rounded-lg border">{filteredContacts.map(person => <div key={person.id} className="flex items-center gap-3 p-3"><Avatar person={person} size="sm" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{person.name}</div><div className="truncate font-mono text-xs text-muted-foreground">{person.jibuId}</div></div><Button size="sm" variant="outline" disabled={busy} onClick={() => messageContact(person)}><MessageCircle className="mr-1.5 h-4 w-4" />Message</Button><Button size="icon-sm" variant="ghost" title={`Remove ${person.name} from contacts`} aria-label={`Remove ${person.name} from contacts`} disabled={busy} onClick={() => void removeContact(person)}><X /></Button></div>)}</div>}</div></CardContent></Card>}

      {tab === 'updates' && <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.5fr)]"><Card><CardHeader><CardTitle className="text-base">Share an update</CardTitle><p className="text-sm text-muted-foreground">A photo, caption, or both. Updates expire after 24 hours.</p></CardHeader><CardContent className="space-y-3"><Textarea aria-label="Status update" maxLength={500} rows={4} placeholder="What would you like your followers to know?" value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)} /><label className="block text-sm font-medium">Photo <span className="font-normal text-muted-foreground">(optional, up to 5 MB)</span><Input className="mt-1" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0] || null; setStatusImageError(file && file.size > 5 * 1024 * 1024 ? 'Image must be 5 MB or smaller.' : file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ? 'Choose a JPEG, PNG, or WebP image.' : ''); setStatusImage(file && file.size <= 5 * 1024 * 1024 && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ? file : null) }} /></label>{statusImageError && <p role="alert" className="text-sm text-destructive">{statusImageError}</p>}{statusImagePreview && <div className="relative"><img src={statusImagePreview} alt="Status preview" className="max-h-72 w-full rounded-lg object-contain bg-muted" /><Button type="button" variant="secondary" size="icon-sm" className="absolute right-2 top-2" aria-label="Remove selected photo" onClick={() => setStatusImage(null)}><X /></Button></div>}<div className="flex items-center gap-2">{statusColors.map(([color, className]) => <button key={color} type="button" aria-label={`${color} background`} aria-pressed={statusColor === color} onClick={() => setStatusColor(color)} className={`h-7 w-7 rounded-full ${className} ${statusColor === color ? 'ring-2 ring-foreground ring-offset-2' : ''}`} />)}<span className="ml-auto text-xs text-muted-foreground">{statusDraft.length}/500</span></div><Button disabled={busy || Boolean(statusImageError) || (!statusDraft.trim() && !statusImage)} onClick={() => void publishUpdate()}><Send className="mr-2 h-4 w-4" />Post update</Button></CardContent></Card><div className="space-y-3"><h2 className="text-sm font-semibold">Recent updates</h2>{updates.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Your updates and followed members’ updates appear here.</CardContent></Card> : updates.map((update) => <div key={update.id} className={`overflow-hidden rounded-lg text-white ${statusColors.find(([color]) => color === update.background)?.[1] || 'bg-emerald-700'}`}><div className="flex items-center gap-3 p-4"><Avatar person={update.user} size="sm" /><div className="min-w-0 flex-1"><div className="font-medium">{update.user.name}</div><div className="text-xs text-white/75">{dateLabel(update.createdAt)} · expires {dateLabel(update.expiresAt)}</div></div>{update.user.id === profile.id && <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/15 hover:text-white" title="Delete update" onClick={() => void run(() => request(`/updates/${update.id}`, { method: 'DELETE' }), 'Update deleted.')}><X /></Button>}</div>{update.imageUrl && <img src={update.imageUrl} alt="" loading="lazy" className="max-h-[560px] w-full bg-black/10 object-contain" />}{update.body && <p className="whitespace-pre-wrap break-words px-4 pb-4">{update.body}</p>}</div>)}</div></div>}

      {tab === 'communities' && <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.5fr)]"><Card><CardHeader><CardTitle className="text-base">Find a community member</CardTitle><p className="text-sm text-muted-foreground">Discovery is by exact JibuSales ID only; phone numbers and business records stay private.</p></CardHeader><CardContent><form onSubmit={findMember} className="flex gap-2"><Input aria-label="JibuSales ID" placeholder="+256012345678" value={lookupId} onChange={(event) => setLookupId(event.target.value)} /><Button type="submit" size="icon" disabled={busy} aria-label="Search ID"><Search /></Button></form>{foundPerson && <div className="mt-4 rounded-lg border p-3"><div className="flex items-center gap-3"><Avatar person={foundPerson} /><div className="min-w-0 flex-1"><div className="truncate font-medium">{foundPerson.name}</div><div className="font-mono text-xs text-muted-foreground">{foundPerson.jibuId}</div></div></div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => void follow(foundPerson, following.some((person) => person.id === foundPerson.id))}>{following.some((person) => person.id === foundPerson.id) ? 'Unfollow' : 'Follow'}</Button><Button size="sm" variant="outline" onClick={() => setReportingPerson(foundPerson)}><Flag className="mr-1.5 h-3.5 w-3.5" />Report</Button><Button size="sm" variant="outline" onClick={() => void lookupBlock(foundPerson)}><ShieldBan className="mr-1.5 h-3.5 w-3.5" />Block</Button></div></div>}</CardContent></Card><div className="space-y-3"><div className="flex gap-2 border-b pb-2"><Button variant={communityTab === 'following' ? 'secondary' : 'ghost'} onClick={() => setCommunityTab('following')}>Following</Button><Button variant={communityTab === 'followers' ? 'secondary' : 'ghost'} onClick={() => setCommunityTab('followers')}><Users className="mr-2 h-4 w-4" />Followers</Button></div>{people.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No {communityTab} yet.</CardContent></Card> : <Card><CardContent className="divide-y p-2">{people.map((person) => <div key={person.id} className="flex items-center gap-3 p-3"><Avatar person={person} size="sm" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{person.name}</div><div className="font-mono text-xs text-muted-foreground">{person.jibuId}</div></div>{communityTab === 'following' && <Button size="sm" variant="outline" onClick={() => void follow(person, true)}>Unfollow</Button>}</div>)}</CardContent></Card>}{blocked.length > 0 && <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Blocked members</CardTitle></CardHeader><CardContent className="space-y-2">{blocked.map((person) => <div key={person.id} className="flex items-center gap-3"><Avatar person={person} size="sm" /><span className="min-w-0 flex-1 truncate text-sm">{person.name}</span><Button size="sm" variant="outline" onClick={() => void run(() => request(`/blocks/${encodeURIComponent(person.jibuId)}`, { method: 'DELETE' }), 'Member unblocked.')}>Unblock</Button></div>)}</CardContent></Card>}</div></div>}

      {tab === 'calls' && <Card className="mx-auto max-w-2xl"><CardContent className="grid justify-items-center py-16 text-center"><PhoneCall className="mb-4 h-10 w-10 text-muted-foreground" /><h2 className="font-semibold">Calls are not available yet</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">Calling is not enabled in JibuSales Network yet. Your chats and updates are ready to use.</p></CardContent></Card>}

      <div className="border-t pt-4"><p className="text-xs text-muted-foreground">Network is separate from private Team Messaging. Your ID is not your phone number.</p></div>
    </>}

    {profile?.enabled && <>
      <Button className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-5 z-40 h-14 w-14 rounded-full bg-emerald-700 text-white shadow-lg hover:bg-emerald-800" aria-label="New chat" title="New chat" onClick={() => { setFoundPerson(null); setLookupId(''); setIntro(''); setNewChatOpen(true) }}><Plus className="h-6 w-6" /></Button>
      <nav aria-label="Network navigation" className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-2 pt-2 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur supports-[backdrop-filter]:bg-background/85 md:left-64" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)' }}>
        <div className="mx-auto grid max-w-xl grid-cols-4">
          {([['chats', MessageCircle, 'Chats'], ['updates', Clock3, 'Status'], ['communities', Users, 'Communities'], ['calls', PhoneCall, 'Calls']] as const).map(([key, Icon, label]) => <button key={key} type="button" aria-current={tab === key ? 'page' : undefined} onClick={() => { setTab(key); setSelectedChat(null) }} className={`relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md text-xs ${tab === key ? 'font-semibold text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground hover:bg-muted'}`}><span className="relative"><Icon className="h-5 w-5" />{key === 'chats' && unreadCount > 0 && <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-emerald-700 px-1 text-[9px] text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}</span>{label}</button>)}
        </div>
      </nav>
    </>}

    <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>New chat</DialogTitle><DialogDescription>Find someone by their exact JibuSales ID. They must accept your first message before a chat opens.</DialogDescription></DialogHeader>
        <form onSubmit={findMember} className="flex gap-2"><Input aria-label="JibuSales ID" autoFocus placeholder="+256012345678" value={lookupId} onChange={event => setLookupId(event.target.value)} /><Button type="submit" size="icon" disabled={busy || !lookupId.trim()} aria-label="Find member"><Search /></Button></form>
        {foundPerson && <div className="space-y-3 rounded-lg border p-4"><div className="flex items-center gap-3"><Avatar person={foundPerson} /><div className="min-w-0"><div className="truncate font-medium">{foundPerson.name}</div><div className="font-mono text-xs text-muted-foreground">{foundPerson.jibuId}</div></div></div><Textarea aria-label="First message" maxLength={500} rows={3} placeholder="Introduce yourself (optional)" value={intro} onChange={event => setIntro(event.target.value)} /><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => void lookupBlock(foundPerson)}><ShieldBan className="mr-2 h-4 w-4" />Block</Button><Button disabled={busy} onClick={() => void sendRequest()}><Send className="mr-2 h-4 w-4" />Send request</Button></div></div>}
      </DialogContent>
    </Dialog>

    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Network settings</DialogTitle><DialogDescription>Manage your profile and how people can find you on JibuSales Network.</DialogDescription></DialogHeader>
        <div className="space-y-5">
          <div className="flex items-center gap-4"><div className="relative"><Avatar person={{ id: profile?.id || '', name: profile?.name || user?.name || '', avatar: profile?.avatar || user?.avatar || null, jibuId: profile?.jibuId || '' }} size="lg" /><button type="button" title="Upload profile photo" aria-label="Upload profile photo" disabled={uploadingAvatar} onClick={() => avatarInputRef.current?.click()} className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border bg-background text-foreground shadow-sm hover:bg-muted">{uploadingAvatar ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}</button><input ref={avatarInputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void uploadProfilePhoto(event.target.files?.[0])} /></div><div className="min-w-0"><div className="truncate font-semibold">{user?.name || profile?.name || 'JibuSales user'}</div><div className="truncate text-sm text-muted-foreground">{user?.email || 'Email not available'}</div><div className="truncate text-sm text-muted-foreground">{user?.phone || ''}</div><p className="mt-1 text-xs text-muted-foreground">Photo up to 2 MB. Account name and contact details are managed in your account profile.</p></div></div>
          <div className="flex items-center gap-3 rounded-lg border p-3"><div className="min-w-0 flex-1"><div className="text-sm font-medium">JibuSales ID</div><div className="font-mono text-sm text-muted-foreground">{profile?.jibuId || 'Created when you opt in'}</div></div>{profile?.jibuId && <Button variant="outline" size="icon" aria-label="Share JibuSales ID" title="Share JibuSales ID" onClick={() => void shareJibuId()}><Share2 /></Button>}</div>
          {!profile?.enabled ? <div className="space-y-3"><label className="block text-sm font-medium">Country calling code<select className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-foreground" value={countryCode} onChange={event => setCountryCode(event.target.value)}>{countryCodes.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}</select></label><Button disabled={busy} onClick={() => void enableNetwork()}><UserRoundPlus className="mr-2 h-4 w-4" />Opt in and create ID</Button></div> : <div className="flex items-center justify-between gap-4 rounded-lg border p-3"><div><div className="text-sm font-medium">Network profile</div><p className="text-xs text-muted-foreground">{profile.jibuId} is {profile.enabled ? 'discoverable by exact ID' : 'hidden'}.</p></div><Button variant="outline" disabled={busy} onClick={() => void disableNetwork()}>Turn off</Button></div>}
          <Button variant="outline" className="w-full justify-start" onClick={() => { setSettingsOpen(false); navigate('/tenant/profile') }}><UserRoundPlus className="mr-2 h-4 w-4" />Open account profile</Button>
        </div>
      </DialogContent>
    </Dialog>

    {reportingPerson && <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReportingPerson(null) }}><section role="dialog" aria-modal="true" aria-labelledby="network-report-title" className="w-full max-w-md rounded-lg border bg-background p-5 shadow-xl"><div className="flex items-center justify-between"><h2 id="network-report-title" className="font-semibold">Report {reportingPerson.name}</h2><Button variant="ghost" size="icon-sm" aria-label="Close report" onClick={() => setReportingPerson(null)}><X /></Button></div><p className="mt-2 text-sm text-muted-foreground">Reports are submitted to JibuSales for review.</p><label className="mt-4 block text-sm">Reason<select className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="impersonation">Impersonation</option><option value="inappropriate">Inappropriate content</option><option value="other">Other</option></select></label><div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={() => setReportingPerson(null)}>Cancel</Button><Button disabled={busy} onClick={() => void submitReport(reportingPerson)}><Flag className="mr-2 h-4 w-4" />Submit report</Button></div></section></div>}
  </div>
}
