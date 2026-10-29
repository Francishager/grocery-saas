import { useState } from 'react'
import { LoaderCircle, Sparkles } from 'lucide-react'
import { aiWritingApi } from '@/lib/api'
import { useJWTAuth } from '@/contexts/JWTAuthContext'
import { useFeatureAccess } from '@/services/featureAccessService'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const sensitivePattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?\d[\s().-]*){8,}\d|\b(?:UGX|KES|TZS|RWF|USD|EUR|GBP)\s*[\d,.]+|[$€£]\s*[\d,.]+|\b(?:password|passcode|pin|bank account|account number|card number|national id|nin|customer balance|salary|credit limit)\b/i

export function AIWritingAssist({ module, field, onUse }: {
  module: 'crm' | 'planner' | 'general'
  field: string
  onUse: (text: string) => void
}) {
  const { hasPermission } = useJWTAuth()
  const { hasFeature } = useFeatureAccess()
  const [open, setOpen] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false)
  const fieldLabels: Record<string, string> = {
    'opportunity': 'opportunity', 'lead notes': 'lead notes', 'interaction notes': 'interaction notes',
    'support case details': 'support case details', 'campaign name': 'campaign name',
    'email subject': 'email subject', 'campaign content': 'campaign content',
    'planner title': 'planner title', 'planner notes': 'planner notes',
    'tenancy agreement notes': 'tenancy agreement notes',
    'business text': 'business text',
  }

  if (!hasPermission('canUseBusinessAI') || !(module === 'general' ? hasFeature('dashboard') : hasFeature(module) || hasFeature('rentals'))) return null

  const generate = async () => {
    const prompt = instruction.trim()
    if (!prompt) { setError('Enter what you want help writing.'); return }
    if (sensitivePattern.test(prompt)) { setError('Remove names, contact details, amounts, and account or identity information.'); return }
    setBusy(true); setError('')
    try {
      const result = module === 'general'
        ? await aiWritingApi.draftGeneral(prompt)
        : await aiWritingApi.draft(module, fieldLabels[field] || field, prompt)
      onUse(result.text)
      setInstruction('')
      setPrivacyConfirmed(false)
      setOpen(false)
    } catch (cause: any) { setError(cause?.message || 'Could not generate a draft. Try again.') }
    finally { setBusy(false) }
  }

  return <>
    <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 border-sky-300 bg-sky-50 px-2.5 text-xs font-medium text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200 dark:hover:bg-sky-900" aria-expanded={open} onClick={() => { setOpen(true); setError('') }}>
      <Sparkles className="h-3.5 w-3.5 shrink-0" /> <span>AI writing help</span>
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Draft {fieldLabels[field] || field}</DialogTitle>
          <DialogDescription>Only your instruction and this generic field type are sent. Your current field content and CRM/Planner records are not shared. Do not include names, contact details, amounts, or private business information. Generate inserts the draft into the field, where you can review and edit it.</DialogDescription>
        </DialogHeader>
        <textarea autoFocus value={instruction} onChange={event => { setInstruction(event.target.value); setPrivacyConfirmed(false) }} rows={4} maxLength={1200} placeholder="Tell the assistant what to write…" className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" className="mt-0.5" checked={privacyConfirmed} onChange={event => setPrivacyConfirmed(event.target.checked)} /><span>I confirm this instruction contains no customer, employee, or confidential business information.</span></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" disabled={busy || !instruction.trim() || !privacyConfirmed} onClick={() => void generate()}>{busy && <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" />}{busy ? 'Writing…' : 'Generate'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>
}
