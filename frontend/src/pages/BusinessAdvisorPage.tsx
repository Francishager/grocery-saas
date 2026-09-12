import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MessageSquare, Send, Plus, Square, RotateCcw, TrendingUp, Megaphone, Package, Users } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useOnlineStatus } from '@/db/hooks'
import { Button } from '@/components/ui/button'

type Snapshot = {
  business: { name: string; currency: string; timezone: string }
  period: { days: number; from: string; to: string }
  scope: { branch: string; sales: string }
  asOf: string
  sources: string[]
  limitations: string[]
}
type Message = { role: 'user' | 'assistant'; content: string; context?: Snapshot; truncated?: boolean }
const suggestions = [
  { icon: TrendingUp, text: 'How can I increase sales this week?' },
  { icon: Megaphone, text: 'Create a practical 7-day marketing plan for my business.' },
  { icon: Package, text: 'Which products should I promote, and which need restocking?' },
  { icon: Users, text: 'How can I bring back customers and encourage repeat purchases?' },
]
const displayDate = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })

export default function BusinessAdvisorPage() {
  const { user, hasPermission } = useJWTAuth()
  const online = useOnlineStatus()
  const allowed = hasPermission('canUseBusinessAI')
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [days, setDays] = useState(30)
  const [pending, setPending] = useState(false)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [businessName, setBusinessName] = useState('Your business')
  const requestRef = useRef<AbortController | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const identity = `${user?.tenantId || ''}:${user?.id || ''}:${(user?.permissions || []).join(',')}`

  useEffect(() => {
    requestRef.current?.abort()
    requestRef.current = null
    setMessages([]); setDraft(''); setPending(false); setError(''); setConfigured(null)
  }, [identity, allowed])

  useEffect(() => {
    const controller = new AbortController()
    setConfigured(null)
    if (!allowed || !online) return () => controller.abort()
    apiFetch('/api/ai/status', { signal: controller.signal }).then(async response => {
      const data = await response.json()
      if (controller.signal.aborted) return
      if (!response.ok) throw new Error(data.error || data.message || 'AI Advisor is unavailable.')
      setConfigured(data.configured === true)
    }).catch(error => { if (!controller.signal.aborted) { setConfigured(false); setError(error.message || 'AI Advisor is unavailable.') } })
    apiFetch('/api/settings/business-profile', { signal: controller.signal }).then(async response => {
      if (response.ok) { const data = await response.json(); if (!controller.signal.aborted) setBusinessName(data.name || data.businessName || 'Your business') }
    }).catch(() => {})
    return () => { controller.abort(); requestRef.current?.abort() }
  }, [identity, allowed, online])

  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [messages, pending, error])

  function newChat() {
    requestRef.current?.abort(); requestRef.current = null
    setPending(false); setMessages([]); setError(''); setDraft('')
    inputRef.current?.focus()
  }

  async function send(content = draft, retry = false) {
    const text = content.trim()
    if (requestRef.current || !allowed || !online || !configured || (!retry && (!text || text.length > 2000))) return
    const previous = messages.at(-1)?.role === 'user' ? messages.slice(0, -1) : messages
    const next: Message[] = retry ? messages : [...previous, { role: 'user', content: text }]
    if (!next.length || next.at(-1)?.role !== 'user') return
    let history = next.map(({ role, content }) => ({ role, content })).slice(-15)
    while (history.reduce((sum, message) => sum + message.content.length, 0) > 24000) history = history.slice(2)
    const controller = new AbortController()
    requestRef.current = controller
    setPending(true); setError(''); setMessages(next); setDraft('')
    const timer = window.setTimeout(() => controller.abort(), 65000)
    try {
      const response = await apiFetch('/api/ai/chat', { method: 'POST', signal: controller.signal, body: JSON.stringify({ messages: history, days }) })
      const data = await response.json()
      if (requestRef.current !== controller) return
      if (!response.ok) throw new Error(data.error || data.message || 'The advisor could not respond. Please try again.')
      if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('The advisor returned an empty reply. Please try again.')
      setMessages([...next, { role: 'assistant', content: data.reply, context: data.context, truncated: data.truncated }])
      setBusinessName(data.context?.business?.name || businessName)
    } catch (error: any) {
      if (requestRef.current !== controller) return
      setError(controller.signal.aborted ? 'Reply stopped or timed out. You can retry your last message.' : error?.message || 'Unable to connect. Please try again.')
    } finally {
      window.clearTimeout(timer)
      if (requestRef.current === controller) { requestRef.current = null; setPending(false) }
    }
  }

  function submit(event: FormEvent) { event.preventDefault(); void send() }
  const canSend = allowed && online && configured === true && !pending
  if (!allowed) return <div className="p-6" role="alert">You do not have permission to use AI Advisor. Contact your business owner.</div>

  return <section className="mx-auto flex h-[calc(100dvh-7rem)] min-h-[30rem] w-full max-w-6xl flex-col gap-4 p-4 md:p-6" aria-label="AI business advisor">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><MessageSquare className="h-6 w-6 shrink-0 text-primary" />AI Advisor</h1>
        <p className="mt-1 break-words text-sm font-medium">{businessName}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm">Period <select aria-label="Business data period" value={days} disabled={pending} onChange={event => setDays(Number(event.target.value))} className="ml-2 h-9 rounded-md border bg-background px-2">
          {[7, 30, 90].map(value => <option key={value} value={value}>Last {value} days</option>)}
        </select></label>
        <Button variant="outline" size="sm" onClick={newChat}><Plus className="mr-1 h-4 w-4" />New chat</Button>
      </div>
    </header>
    {!online && <p role="alert" className="text-sm text-amber-700">AI Advisor needs an internet connection.</p>}
    {online && configured === false && !error && <p role="alert" className="text-sm text-amber-700">AI Advisor is not configured yet. Contact JibuSales Admin.</p>}
    <div ref={logRef} role="log" aria-label="Advisor conversation" aria-live="polite" aria-busy={pending} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-1">
      {!messages.length && <div className="py-4">
        <img src="/img/jibusales_logo.png" alt="JibuSales" className="mb-4 h-8 w-auto max-w-full object-contain" />
        <h2 className="text-lg font-medium">What would you like to improve?</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {suggestions.map(({ icon: Icon, text }) => <button key={text} type="button" disabled={!canSend} onClick={() => void send(text)} className="flex min-w-0 items-start gap-3 rounded-md border px-3 py-3 text-left text-sm hover:bg-muted disabled:opacity-50">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span className="break-words">{text}</span>
          </button>)}
        </div>
      </div>}
      {messages.map((message, index) => <article key={index} aria-label={message.role === 'user' ? 'Your message' : 'Advisor reply'} className={message.role === 'user' ? 'ml-auto w-fit max-w-[92%] rounded-md bg-muted px-4 py-3 sm:max-w-[85%]' : 'max-w-full border-b pb-5'}>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">{message.role === 'user' ? 'You' : 'JibuSales AI'}</p>
        <div className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{message.content}</div>
        {message.truncated && <p className="mt-2 text-xs text-muted-foreground">Reply reached its length limit.</p>}
        {message.context && <details className="mt-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer py-1 font-medium">Business data used</summary>
          <div className="mt-2 space-y-1 break-words">
            <p>{message.context.business.name} | {displayDate(message.context.period.from)} to {displayDate(message.context.period.to)}</p>
            <p>{message.context.scope.branch} | {message.context.scope.sales}</p>
            <p>{message.context.sources.join(', ') || 'Business profile only'}</p>
            {message.context.limitations.map((limitation, i) => <p key={i}>{limitation}</p>)}
          </div>
        </details>}
      </article>)}
      {pending && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" />Reviewing your business data...</p>}
      {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p className="break-words">{error}</p>
        {messages.at(-1)?.role === 'user' && <Button variant="outline" size="sm" disabled={!canSend} onClick={() => void send('', true)}><RotateCcw className="mr-2 h-4 w-4" />Retry last message</Button>}
      </div>}
    </div>
    <form onSubmit={submit} className="shrink-0 border-t pt-3">
      <div className="flex items-end gap-2">
        <textarea ref={inputRef} aria-label="Message AI Advisor" placeholder="Ask about your sales, marketing or stock..." value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} rows={3}
          disabled={!online || configured !== true || pending} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }}
          className="min-w-0 flex-1 resize-none rounded-md border bg-background p-3 text-sm leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" />
        {pending ? <Button type="button" variant="outline" size="icon" aria-label="Stop reply" title="Stop reply" onClick={() => requestRef.current?.abort()}><Square className="h-4 w-4" /></Button>
          : <Button type="submit" size="icon" disabled={!canSend || !draft.trim()} aria-label="Send message" title="Send message"><Send className="h-4 w-4" /></Button>}
      </div>
      <div className="mt-2 flex items-start justify-between gap-3 text-xs text-muted-foreground"><p>AI advice may be inaccurate. Business data follows your access permissions.</p><span className="shrink-0 tabular-nums">{draft.length}/2000</span></div>
    </form>
  </section>
}
