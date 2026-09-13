import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MessageSquare, Send, Plus, Square, RotateCcw, Folder, FolderPlus, BriefcaseBusiness, Search, PanelLeft, PanelLeftClose, Pencil, Trash2, Lock, Globe, Brain, Copy, Check } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '@/lib/api'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useOnlineStatus } from '@/db/hooks'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import AdvisorMarkdown from '@/components/AdvisorMarkdown'
import AdvisorReplyActions from '@/components/AdvisorReplyActions'
import AdvisorCreativeStudio from '@/components/AdvisorCreativeStudio'
import { copyText } from '@/lib/advisorVisuals'

type Collection = { id: string; name: string; kind: 'project' | 'folder'; parentId: string | null; instructions: string }
type Chat = { id: string; title: string; collectionId: string | null; updatedAt: string; locked?: boolean }
type Snapshot = { business: { name: string }; period: { from: string; to: string }; scope: { branch: string }; sources: string[]; limitations: string[];
  research?: { status: string; kind?: string; notice?: string; sources: { title: string; url: string }[] }; memory?: { previousConversations: number } }
type Turn = { id: string; requestId: string; sequence: number; input: string; output?: string; status: string; context?: Snapshot; truncated?: boolean; feedback?: number | null }
type Editor = { type: 'project' | 'folder' | 'chat'; id?: string; name: string; instructions: string; parentId: string }
const suggestions = ['Create a practical growth plan for this business.', 'Which customers need repayment follow-up?', 'How can we improve staff productivity and retention?', 'What should we promote or restock?']
const date = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
const inputClass = 'w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm'
async function request(path: string, options: RequestInit = {}) {
  const response = await apiFetch(`/api/ai${path}`, options)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || data.message || 'Unable to load AI Advisor.')
  return data
}

export default function BusinessAdvisorPage() {
  const { user, hasPermission } = useJWTAuth()
  const online = useOnlineStatus()
  const allowed = hasPermission('canUseBusinessAI')
  const [params, setParams] = useSearchParams()
  const [collections, setCollections] = useState<Collection[]>([])
  const [chats, setChats] = useState<Chat[]>([])
  const [current, setCurrent] = useState<Chat | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [older, setOlder] = useState(false)
  const [sidebar, setSidebar] = useState(false)
  const [sidebarMinimized, setSidebarMinimized] = useState(() => localStorage.getItem('aiAdvisorSidebarMinimized') === '1')
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)
  const [draft, setDraft] = useState('')
  const [days, setDays] = useState(30)
  const [research, setResearch] = useState(true)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [deleting, setDeleting] = useState<{ type: 'chat' | 'collection'; id: string; name: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [dialogError, setDialogError] = useState('')
  const [copying, setCopying] = useState(false)
  const [copied, setCopied] = useState(false)
  const requestRef = useRef<AbortController | null>(null)
  const readRef = useRef<AbortController | null>(null)
  const listVersion = useRef(0)
  const generation = useRef(0)
  const logRef = useRef<HTMLDivElement | null>(null)
  const identity = `${user?.tenantId || ''}:${user?.id || ''}:${(user?.permissions || []).join(',')}`

  async function loadLibrary(nextPage = 1, append = false) {
    const version = ++listVersion.current
    const query = new URLSearchParams({ page: String(nextPage), ...(filter ? { collectionId: filter } : {}), ...(search.trim() ? { search: search.trim() } : {}) })
    try {
      const data = await request(`/conversations?${query}`)
      if (version !== listVersion.current) return
      setChats(previous => append ? [...previous, ...data.conversations.filter((chat: Chat) => !previous.some(row => row.id === chat.id))] : data.conversations)
      setHasMore(data.hasMore); setPage(nextPage)
    } catch (error: any) { if (version === listVersion.current) setError(error.message) }
  }
  async function loadCollections() {
    const version = generation.current
    const data = await request('/collections')
    if (version === generation.current) setCollections(data.collections)
  }
  async function openChat(id: string, before?: number) {
    if (pending) return
    readRef.current?.abort()
    const controller = new AbortController(); readRef.current = controller
    setLoading(true); setError('')
    if (!before) { setTurns([]); setCurrent(null); setOlder(false); setDraft(''); setSidebar(false) }
    try {
      const data = await request(`/conversations/${encodeURIComponent(id)}${before ? `?before=${before}` : ''}`, { signal: controller.signal })
      if (controller.signal.aborted) return
      setCurrent(data.conversation); setTurns(previous => before ? [...data.turns, ...previous] : data.turns); setOlder(data.hasMore)
      setParams({ chat: id }, { replace: true })
    } catch (error: any) { if (!controller.signal.aborted) setError(error.message) }
    finally { if (!controller.signal.aborted) setLoading(false) }
  }
  useEffect(() => {
    generation.current++; listVersion.current++
    requestRef.current?.abort(); readRef.current?.abort(); requestRef.current = null
    setTurns([]); setCurrent(null); setCollections([]); setChats([]); setDraft(''); setError(''); setPending(false); setLoading(false); setConfigured(null); setEditor(null); setDeleting(null)
    if (!allowed || !online) return
    const controller = new AbortController()
    request('/status', { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setConfigured(data.configured) }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    void loadCollections().catch(error => { if (!controller.signal.aborted) setError(error.message) })
    const saved = params.get('chat')
    if (saved) void openChat(saved)
    return () => { generation.current++; listVersion.current++; controller.abort(); requestRef.current?.abort(); readRef.current?.abort() }
  }, [identity, allowed, online])
  useEffect(() => {
    listVersion.current++
    if (!allowed || !online) return
    const timer = window.setTimeout(() => void loadLibrary(), 200)
    return () => { window.clearTimeout(timer); listVersion.current++ }
  }, [identity, allowed, online, filter, search])
  useEffect(() => { if (logRef.current && !loading) logRef.current.scrollTop = logRef.current.scrollHeight }, [pending, current?.id])
  useEffect(() => { localStorage.setItem('aiAdvisorSidebarMinimized', sidebarMinimized ? '1' : '0') }, [sidebarMinimized])

  function newChat() {
    if (pending) return
    readRef.current?.abort(); setCurrent(null); setTurns([]); setDraft(''); setError(''); setOlder(false); setLoading(false); setSidebar(false); setParams({}, { replace: true })
  }
  async function ensureCreativeConversation(title: string, signal: AbortSignal) {
    if (current) return current.id
    const version = generation.current
    const data = await request('/conversations', { method: 'POST', signal, body: JSON.stringify({ title, collectionId: filter || null }) })
    if (version !== generation.current || signal.aborted) throw new Error('The account changed. Reopen AI Advisor.')
    setCurrent(data.conversation); setParams({ chat: data.conversation.id }, { replace: true }); void loadLibrary()
    return data.conversation.id as string
  }
  async function copyConversation() {
    if (!current || copying) return
    const version = generation.current
    setCopying(true); setError('')
    try {
      let data = await request(`/conversations/${encodeURIComponent(current.id)}`)
      let all: Turn[] = data.turns
      while (data.hasMore && data.turns.length && version === generation.current) {
        data = await request(`/conversations/${encodeURIComponent(current.id)}?before=${data.turns[0].sequence}`)
        all = [...data.turns, ...all]
      }
      if (version !== generation.current) return
      await copyText([current.title, ...all.flatMap(turn => [`You: ${turn.input}`, ...(turn.output ? [`JibuSales AI: ${turn.output}`] : [])])].join('\n\n'))
      setCopied(true); window.setTimeout(() => setCopied(false), 2000)
    } catch (error: any) { if (version === generation.current) setError(error.message) }
    finally { if (version === generation.current) setCopying(false) }
  }
  async function send(content = draft, retry?: Turn) {
    const message = (retry?.input || content).trim()
    if (requestRef.current || !allowed || !online || !configured || loading || !message || message.length > 6000) return
    const controller = new AbortController(); requestRef.current = controller
    const requestId = retry?.requestId || crypto.randomUUID()
    setPending(true); setError(''); setDraft(''); setSidebar(false)
    const timer = window.setTimeout(() => controller.abort(), 130000)
    let localTurn: Turn | undefined
    try {
      let chat = current
      if (!chat) {
        const data = await request('/conversations', { method: 'POST', signal: controller.signal, body: JSON.stringify({ title: message.slice(0, 100), collectionId: filter || null }) })
        if (requestRef.current !== controller) return
        chat = data.conversation as Chat; setCurrent(chat); setParams({ chat: chat.id }, { replace: true })
      }
      localTurn = retry || { id: requestId, requestId, sequence: (turns.at(-1)?.sequence || 0) + 1, input: message, status: 'pending' }
      setTurns(previous => retry ? previous.map(row => row.requestId === requestId ? { ...row, status: 'pending' } : row) : [...previous, localTurn!])
      const data = await request('/chat', { method: 'POST', signal: controller.signal, body: JSON.stringify({ conversationId: chat.id, requestId, message, days, research, remember }) })
      if (requestRef.current !== controller) return
      setTurns(previous => previous.map(row => row.requestId === requestId ? data.turn : row))
      void loadLibrary()
    } catch (error: any) {
      if (requestRef.current !== controller) return
      setError(controller.signal.aborted ? 'Reply stopped or timed out. Retry to continue the saved conversation.' : error.message)
      if (localTurn) setTurns(previous => previous.map(row => row.requestId === requestId ? { ...row, status: 'failed' } : row))
      else setDraft(message)
    } finally {
      window.clearTimeout(timer)
      if (requestRef.current === controller) { requestRef.current = null; setPending(false) }
    }
  }
  async function saveEditor(event: FormEvent) {
    event.preventDefault()
    if (!editor || saving) return
    setSaving(true); setDialogError('')
    try {
      if (editor.type === 'chat') {
        await request(`/conversations/${editor.id}`, { method: 'PATCH', body: JSON.stringify({ title: editor.name, collectionId: editor.parentId || null }) })
        setCurrent(previous => previous?.id === editor.id ? { ...previous, title: editor.name, collectionId: editor.parentId || null } : previous)
      } else {
        await request(`/collections${editor.id ? `/${editor.id}` : ''}`, { method: editor.id ? 'PATCH' : 'POST', body: JSON.stringify({ name: editor.name, instructions: editor.instructions, parentId: editor.parentId || null, ...(!editor.id ? { kind: editor.type } : {}) }) })
        await loadCollections()
      }
      setEditor(null); void loadLibrary()
    } catch (error: any) { setDialogError(error.message) }
    finally { setSaving(false) }
  }
  async function remove() {
    if (!deleting || saving) return
    setSaving(true); setDialogError('')
    try {
      await request(`/${deleting.type === 'chat' ? 'conversations' : 'collections'}/${deleting.id}`, { method: 'DELETE' })
      if (deleting.type === 'chat' && current?.id === deleting.id) newChat()
      if (deleting.type === 'collection') { setFilter(''); await loadCollections(); if (current?.collectionId === deleting.id) setCurrent({ ...current, collectionId: null }) }
      setDeleting(null); void loadLibrary()
    } catch (error: any) { setDialogError(error.message) }
    finally { setSaving(false) }
  }
  const canSend = allowed && online && configured === true && !pending && !loading
  const selectedCollection = collections.find(row => row.id === filter)
  const editCollection = (row: Collection) => { setDialogError(''); setEditor({ type: row.kind, id: row.id, name: row.name, instructions: row.instructions, parentId: row.parentId || '' }) }
  const collectionButton = (row: Collection, child = false) => <div key={row.id} className={`flex min-w-0 items-center ${child ? 'pl-4' : ''}`}>
    <button type="button" disabled={pending} onClick={() => setFilter(row.id)} className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${filter === row.id ? 'bg-muted font-semibold' : 'hover:bg-muted/50'}`}>
      {row.kind === 'folder' ? <Folder className="h-4 w-4 shrink-0 text-amber-600" /> : <BriefcaseBusiness className="h-4 w-4 shrink-0 text-emerald-700" />}<span className="break-words [overflow-wrap:anywhere]">{row.name}</span>
    </button>
    <Button size="icon" variant="ghost" disabled={pending || !online} className="h-8 w-8 shrink-0" title={`Edit ${row.name}`} aria-label={`Edit ${row.name}`} onClick={() => editCollection(row)}><Pencil className="h-3 w-3" /></Button>
  </div>
  if (!allowed) return <div className="p-6" role="alert">You do not have permission to use AI Advisor. Contact your business owner.</div>

  return <section className="mx-auto flex h-[calc(100dvh-7rem)] min-h-[28rem] w-full max-w-[1600px] flex-col p-3 md:min-h-[34rem] md:p-5" aria-label="AI business advisor">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
      <div className="flex min-w-0 items-center gap-2"><Button size="icon" variant="ghost" className="md:hidden" aria-label="Show conversations" aria-expanded={sidebar} onClick={() => setSidebar(!sidebar)}><PanelLeft className="h-5 w-5" /></Button>
        <Button size="icon" variant="ghost" className="hidden md:inline-flex" aria-label={sidebarMinimized ? 'Show conversations' : 'Minimize conversations'} aria-pressed={sidebarMinimized} title={sidebarMinimized ? 'Show conversations' : 'Minimize conversations'} onClick={() => setSidebarMinimized(value => !value)}>{sidebarMinimized ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}</Button>
        <MessageSquare className="h-5 w-5 shrink-0 text-primary" /><h1 className="text-xl font-semibold">AI Advisor</h1></div>
      <div className="flex flex-wrap items-center gap-2"><label className="text-xs">Period <select aria-label="Business data period" value={days} disabled={pending} onChange={event => setDays(Number(event.target.value))} className="h-9 rounded-md border bg-background px-2">{[7, 30, 90].map(value => <option key={value} value={value}>{value} days</option>)}</select></label>
        <AdvisorCreativeStudio key={identity} conversationId={current?.id} disabled={!canSend} days={days} ensureConversation={ensureCreativeConversation} />
        <Button variant="outline" size="sm" disabled={pending} onClick={newChat}><Plus className="mr-1 h-4 w-4" />New chat</Button></div>
    </header>
    {!online && <p role="alert" className="py-2 text-sm text-amber-700">AI Advisor needs an internet connection.</p>}
    {configured === false && <p role="alert" className="py-2 text-sm text-amber-700">AI Advisor is not configured yet. Contact JibuSales Admin.</p>}
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside aria-label="Saved conversations" className={`${sidebar ? 'flex' : 'hidden'} ${sidebarMinimized ? 'md:hidden' : 'md:flex'} max-h-[30dvh] shrink-0 flex-col gap-3 overflow-y-auto border-b py-3 md:max-h-none md:w-64 md:border-b-0 md:border-r md:pr-3 xl:w-72`}>
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Projects & folders</h2><div className="flex gap-1">
          <Button variant="ghost" size="icon" title="New folder" aria-label="New folder" disabled={pending || !online} onClick={() => { setDialogError(''); setEditor({ type: 'folder', name: '', instructions: '', parentId: '' }) }}><FolderPlus className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" title="New project" aria-label="New project" disabled={pending || !online} onClick={() => { setDialogError(''); setEditor({ type: 'project', name: '', instructions: '', parentId: selectedCollection?.kind === 'folder' ? filter : '' }) }}><Plus className="h-4 w-4" /></Button></div></div>
        <nav aria-label="Chat organization" className="space-y-1"><button type="button" disabled={pending} onClick={() => setFilter('')} className={`w-full rounded-md px-2 py-2 text-left text-sm ${!filter ? 'bg-muted font-semibold' : ''}`}>All chats</button>
          {collections.filter(row => !row.parentId).map(row => <div key={row.id}>{collectionButton(row)}{collections.filter(child => child.parentId === row.id).map(child => collectionButton(child, true))}</div>)}</nav>
        <div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><input aria-label="Search conversations" placeholder="Search conversations" value={search} maxLength={100} onChange={event => setSearch(event.target.value)} className={`${inputClass} pl-8`} /></div>
        <div className="space-y-1">{chats.map(chat => <button key={chat.id} type="button" disabled={pending} onClick={() => void openChat(chat.id)} className={`flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted ${current?.id === chat.id ? 'bg-muted' : ''}`}>
          {chat.locked ? <Lock className="mt-1 h-3 w-3 shrink-0" /> : <MessageSquare className="mt-1 h-3 w-3 shrink-0" />}<span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{chat.title}<span className="mt-1 block text-xs text-muted-foreground">{date(chat.updatedAt)}</span></span></button>)}
          {!chats.length && <p className="px-2 text-xs text-muted-foreground">No conversations</p>}
          {hasMore && <Button variant="ghost" size="sm" onClick={() => void loadLibrary(page + 1, true)}>More conversations</Button>}</div>
      </aside>
      <main className={`flex min-h-0 min-w-0 flex-1 flex-col gap-3 pt-3 ${sidebarMinimized ? 'md:pl-0' : 'md:pl-5'}`}>
        <div className="flex min-w-0 items-start justify-between gap-2"><h2 className="min-w-0 break-words text-base font-semibold [overflow-wrap:anywhere]">{current?.title || selectedCollection?.name || 'New conversation'}</h2>
          {current && <div className="flex shrink-0"><Button size="icon" variant="ghost" title={copied ? 'Conversation copied' : 'Copy conversation'} aria-label="Copy conversation" disabled={pending || !online || copying} onClick={() => void copyConversation()}>{copied ? <Check className="h-4 w-4 text-emerald-700" /> : <Copy className="h-4 w-4" />}</Button><Button size="icon" variant="ghost" title="Edit conversation" aria-label="Edit conversation" disabled={pending || !online} onClick={() => { setDialogError(''); setEditor({ type: 'chat', id: current.id, name: current.title, instructions: '', parentId: current.collectionId || '' }) }}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" title="Delete conversation" aria-label="Delete conversation" disabled={pending || !online} onClick={() => { setDialogError(''); setDeleting({ type: 'chat', id: current.id, name: current.title }) }}><Trash2 className="h-4 w-4" /></Button></div>}</div>
        <div ref={logRef} role="log" aria-label="Advisor conversation" aria-live="polite" aria-busy={pending || loading} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-1">
          {older && <Button size="sm" variant="outline" disabled={loading || pending} onClick={() => current && void openChat(current.id, turns[0]?.sequence)}>Earlier messages</Button>}
          {loading && <p role="status" className="text-sm text-muted-foreground">Loading conversation...</p>}
          {!turns.length && !loading && <div className="py-4"><img src="/img/jibusales_logo.png" alt="JibuSales" className="mb-4 h-8 w-auto max-w-full object-contain" /><h3 className="text-lg font-medium">What would you like to improve?</h3>
            <div className="mt-4 grid gap-2 lg:grid-cols-2">{suggestions.map(suggestion => <button type="button" key={suggestion} disabled={!canSend} onClick={() => void send(suggestion)} className="rounded-md border p-3 text-left text-sm hover:bg-muted disabled:opacity-50">{suggestion}</button>)}</div></div>}
          {turns.map(turn => <div key={turn.id} className="space-y-4">
            <article aria-label="Your message" className="ml-auto w-fit max-w-[95%] rounded-md bg-muted px-4 py-3 sm:max-w-[85%]"><p className="mb-1 text-xs font-semibold">You</p><div className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{turn.input}</div></article>
            {turn.output && <article aria-label="Advisor reply" className="min-w-0 border-b pb-5"><p className="mb-2 text-xs font-semibold text-muted-foreground">JibuSales AI</p><div data-advisor-content><AdvisorMarkdown>{turn.output}</AdvisorMarkdown></div>
              {current && turn.status === 'complete' && <AdvisorReplyActions conversationId={current.id} turn={turn} disabled={!online || pending} onFeedback={feedback => setTurns(previous => previous.map(row => row.id === turn.id ? { ...row, feedback } : row))} />}
              {turn.truncated && <p className="mt-2 text-xs text-muted-foreground">Ask the advisor to continue for more detail.</p>}
              {!!turn.context?.research?.sources?.length && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs" aria-label="Research sources">{turn.context.research.sources.map(source => /^https:\/\//i.test(source.url) && <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="break-words text-primary underline">{source.title}</a>)}</div>}
              {turn.context?.research?.status === 'unavailable' && <p className="mt-2 text-xs text-amber-700">External research unavailable for this reply.</p>}
              {turn.context && <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">Sources & memory</summary><div className="mt-2 space-y-1 break-words">
                <p>{turn.context.business?.name} | {date(turn.context.period.from)} to {date(turn.context.period.to)} | {turn.context.scope?.branch}</p><p>{turn.context.sources?.join(', ')}</p>
                {turn.context.memory && <p>{turn.context.memory.previousConversations} previous conversations consulted</p>}{turn.context.limitations?.map((line, index) => <p key={index}>{line}</p>)}</div></details>}
            </article>}
            {turn.status !== 'complete' && !pending && <Button variant="outline" size="sm" disabled={!canSend} onClick={() => void send('', turn)}><RotateCcw className="mr-2 h-4 w-4" />Retry message</Button>}
          </div>)}
          {pending && <p role="status" className="text-sm text-muted-foreground">Preparing your reply...</p>}
          {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
        </div>
        <form onSubmit={event => { event.preventDefault(); void send() }} className="shrink-0 border-t pt-3">
          <div className="mb-2 flex flex-wrap gap-4 text-xs"><label className="flex items-center gap-1.5"><input type="checkbox" checked={research} disabled={pending} onChange={event => setResearch(event.target.checked)} /><Globe className="h-3.5 w-3.5" />External research</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={remember} disabled={pending} onChange={event => setRemember(event.target.checked)} /><Brain className="h-3.5 w-3.5" />Recall other chats</label></div>
          <div className="flex items-end gap-2"><textarea aria-label="Message AI Advisor" placeholder="Ask about your business..." value={draft} onChange={event => setDraft(event.target.value)} maxLength={6000} rows={3} disabled={!canSend}
            onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }} className={`${inputClass} resize-none leading-5`} />
            {pending ? <Button type="button" size="icon" variant="outline" aria-label="Stop reply" title="Stop reply" onClick={() => requestRef.current?.abort()}><Square className="h-4 w-4" /></Button> : <Button type="submit" size="icon" disabled={!canSend || !draft.trim()} aria-label="Send message" title="Send message"><Send className="h-4 w-4" /></Button>}</div>
          <p className="mt-2 text-xs text-muted-foreground">AI advice may be inaccurate. Verify important decisions. Chats are private to your account.</p>
        </form>
      </main>
    </div>
    <Dialog open={!!editor} onOpenChange={open => { if (!open && !saving) setEditor(null) }}><DialogContent className="rounded-lg sm:max-w-lg"><DialogHeader><DialogTitle>{editor?.id ? 'Edit' : 'New'} {editor?.type === 'chat' ? 'conversation' : editor?.type}</DialogTitle><DialogDescription>{editor?.type === 'chat' ? 'Conversation details' : 'Project and folder details'}</DialogDescription></DialogHeader>
      {editor && <form onSubmit={saveEditor} className="space-y-4"><label className="block text-sm">Name<input autoFocus required maxLength={100} value={editor.name} onChange={event => setEditor({ ...editor, name: event.target.value })} className={`${inputClass} mt-1`} /></label>
        {editor.type !== 'folder' && <label className="block text-sm">{editor.type === 'project' ? 'Folder' : 'Project or folder'}<select aria-label="Project or folder" value={editor.parentId} onChange={event => setEditor({ ...editor, parentId: event.target.value })} className={`${inputClass} mt-1`}><option value="">None</option>{collections.filter(row => editor.type === 'chat' || row.kind === 'folder').map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
        {editor.type === 'project' && <label className="block text-sm">Project goals & instructions<textarea rows={4} maxLength={4000} value={editor.instructions} onChange={event => setEditor({ ...editor, instructions: event.target.value })} className={`${inputClass} mt-1`} /></label>}
        {dialogError && <p role="alert" className="text-sm text-destructive">{dialogError}</p>}
        <div className="flex flex-wrap justify-between gap-2">{editor.id && editor.type !== 'chat' ? <Button type="button" variant="outline" disabled={saving} onClick={() => { setDeleting({ type: 'collection', id: editor.id!, name: editor.name }); setEditor(null) }}><Trash2 className="mr-2 h-4 w-4" />Delete</Button> : <span />}
          <Button type="submit" disabled={saving || !editor.name.trim()}>{saving ? 'Saving...' : 'Save'}</Button></div></form>}
    </DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !saving) setDeleting(null) }}><DialogContent className="rounded-lg"><DialogHeader><DialogTitle>Delete {deleting?.type === 'chat' ? 'conversation' : 'project or folder'}?</DialogTitle><DialogDescription>{deleting?.type === 'chat' ? 'This permanently deletes the conversation, saved memory, ratings and visuals.' : 'Chats are kept under All chats. Projects inside this folder are kept.'}</DialogDescription></DialogHeader>
      <p className="break-words text-sm">{deleting?.name}</p>{dialogError && <p role="alert" className="text-sm text-destructive">{dialogError}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={saving} onClick={() => void remove()}>Delete</Button></div>
    </DialogContent></Dialog>
  </section>
}
