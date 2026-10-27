import { useState } from 'react'
import { LoaderCircle, Sparkles } from 'lucide-react'
import { aiWritingApi } from '@/lib/api'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useFeatureAccess } from '@/services/featureAccessService'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'

const sensitivePattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?\d[\s().-]*){8,}\d|\b(?:UGX|KES|TZS|RWF|USD|EUR|GBP)\s*[\d,.]+|[$€£]\s*[\d,.]+|\b(?:password|passcode|pin|bank account|account number|card number|national id|nin|customer balance|salary|credit limit)\b/i

export function AIWritingAssist({ module, field, onUse }: {
  module: 'crm' | 'planner'
  field: string
  onUse: (text: string) => void
}) {
  const { hasPermission } = useJWTAuth()
  const { hasFeature } = useFeatureAccess()
  const [open, setOpen] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false)
  const fieldLabels: Record<string, string> = {
    'opportunity': 'opportunity', 'lead notes': 'lead notes', 'interaction notes': 'interaction notes',
    'support case details': 'support case details', 'campaign name': 'campaign name',
    'email subject': 'email subject', 'campaign content': 'campaign content',
    'planner title': 'planner title', 'planner notes': 'planner notes',
  }

  if (!hasPermission('canUseBusinessAI') || !(hasFeature(module) || hasFeature('rentals'))) return null

  const generate = async () => {
    const prompt = instruction.trim()
    if (!prompt) { setError('Enter what you want help writing.'); return }
    if (sensitivePattern.test(prompt)) { setError('Remove names, contact details, amounts, and account or identity information.'); return }
    setBusy(true); setError('')
    try {
      const result = await aiWritingApi.draft(module, fieldLabels[field] || field, prompt)
      setDraft(result.text)
    } catch (cause: any) { setError(cause?.message || 'Could not generate a draft. Try again.') }
    finally { setBusy(false) }
  }

  return <Popover open={open} onOpenChange={nextOpen => { setOpen(nextOpen); if (nextOpen) setError('') }}>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 border-sky-300 bg-sky-50 px-2.5 text-xs font-medium text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200 dark:hover:bg-sky-900" aria-expanded={open}>
        <Sparkles className="h-3.5 w-3.5 shrink-0" /> <span>AI writing help</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" side="bottom" sideOffset={6} collisionPadding={12} className="z-[100] w-[min(22rem,calc(100vw-2rem))] p-3">
      <p className="text-sm font-medium">Draft {fieldLabels[field] || field}</p>
      <p className="mt-1 text-xs text-muted-foreground">Only this instruction and the field type are sent. Do not include names, contact details, amounts, or private business information. Your current field content is not shared.</p>
      <Textarea className="mt-3" value={instruction} onChange={event => { setInstruction(event.target.value); setPrivacyConfirmed(false) }} rows={3} maxLength={1200} placeholder="Tell the assistant what to write…" />
      <label className="mt-2 flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" className="mt-0.5" checked={privacyConfirmed} onChange={event => setPrivacyConfirmed(event.target.checked)} /><span>I confirm this instruction contains no customer, employee, or confidential business information.</span></label>
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => { setOpen(false); setDraft('') }}>Close</Button>
        <Button type="button" size="sm" disabled={busy || !instruction.trim() || !privacyConfirmed} onClick={() => void generate()}>{busy && <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />}{busy ? 'Writing…' : 'Generate'}</Button>
      </div>
      {draft && <div className="mt-3 border-t pt-3"><label className="text-xs font-medium" htmlFor={`ai-draft-${module}-${field.replaceAll(' ', '-')}`}>Review draft</label><Textarea id={`ai-draft-${module}-${field.replaceAll(' ', '-')}`} className="mt-1" value={draft} onChange={event => setDraft(event.target.value)} rows={4} maxLength={5000} /><Button type="button" size="sm" className="mt-2 w-full" onClick={() => { onUse(draft); setOpen(false); setDraft(''); setInstruction('') }}>Use draft</Button></div>}
    </PopoverContent>
  </Popover>
}
