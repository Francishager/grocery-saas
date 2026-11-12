import { useState } from 'react'
import { Check, Copy, ThumbsDown, ThumbsUp } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { copyText } from '@/lib/advisorVisuals'
import { Button } from '@/components/ui/button'

export default function AdvisorReplyActions({ conversationId, turn, disabled, onFeedback }: {
  conversationId: string; turn: { id: string; output?: string; feedback?: number | null }; disabled: boolean; onFeedback: (rating: number | null) => void
}) {
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  async function rate(value: number) {
    if (saving || disabled) return
    setSaving(true); setError('')
    try {
      const response = await apiFetch(`/api/ai/conversations/${encodeURIComponent(conversationId)}/turns/${encodeURIComponent(turn.id)}/feedback`, { method: 'PUT', body: JSON.stringify({ feedback: turn.feedback === value ? null : value }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to save your rating.')
      onFeedback(data.feedback)
    } catch (error: any) { setError(error.message) }
    finally { setSaving(false) }
  }
  return <div className="mt-3 flex flex-wrap items-center gap-1">
    <Button size="icon" variant="ghost" className="h-8 w-8" title={copied ? 'Copied' : 'Copy reply'} aria-label="Copy reply" onClick={async event => {
      setError('')
      const content = event.currentTarget.closest('article')?.querySelector('[data-advisor-content]') as HTMLElement | null
      try { await copyText(content?.innerText || turn.output || ''); setCopied(true); window.setTimeout(() => setCopied(false), 2000) } catch (error: any) { setError(error.message) }
    }}>{copied ? <Check className="h-4 w-4 text-emerald-700" /> : <Copy className="h-4 w-4" />}</Button>
    <Button size="icon" variant="ghost" className="h-8 w-8" title="Helpful reply" aria-label="Helpful reply" aria-pressed={turn.feedback === 1} disabled={disabled || saving} onClick={() => void rate(1)}><ThumbsUp className={`h-4 w-4 ${turn.feedback === 1 ? 'fill-emerald-100 text-emerald-700' : ''}`} /></Button>
    <Button size="icon" variant="ghost" className="h-8 w-8" title="Unhelpful reply" aria-label="Unhelpful reply" aria-pressed={turn.feedback === -1} disabled={disabled || saving} onClick={() => void rate(-1)}><ThumbsDown className={`h-4 w-4 ${turn.feedback === -1 ? 'fill-rose-100 text-rose-700' : ''}`} /></Button>
    {copied && <span role="status" className="text-xs text-emerald-700">Copied</span>}
    {error && <p role="alert" className="w-full text-xs text-destructive">{error}</p>}
  </div>
}
