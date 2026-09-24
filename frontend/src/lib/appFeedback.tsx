import { useEffect, useRef, useSyncExternalStore } from 'react'
import { Dialog } from 'radix-ui'
import { AlertTriangle, Info } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { sanitizeNotificationText } from '@/lib/notificationDisplay'

interface Confirmation {
  id: number
  message: string
  inputType?: 'text' | 'password' | 'number'
  resolve: (answer: boolean | string | null) => void
}

let nextId = 0
let confirmations: Confirmation[] = []
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
const snapshot = () => confirmations[0]
const emit = () => listeners.forEach(listener => listener())

export function appNotify(message: unknown) {
  toast({ title: 'Notice', description: sanitizeNotificationText(String(message ?? '')), duration: 10000 })
}

// The caller must await the answer before performing the protected action.
export function appConfirm(message: string): Promise<boolean> {
  return new Promise(resolve => {
    confirmations = [...confirmations, { id: ++nextId, message, resolve: answer => resolve(answer === true) }]
    emit()
  })
}

export function appPrompt(message: string, inputType: Confirmation['inputType'] = 'text'): Promise<string | null> {
  return new Promise(resolve => {
    confirmations = [...confirmations, { id: ++nextId, message, inputType, resolve: answer => resolve(typeof answer === 'string' ? answer : null) }]
    emit()
  })
}

export function AppFeedback() {
  const confirmation = useSyncExternalStore(subscribe, snapshot, snapshot)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => () => {
    const pending = confirmations
    confirmations = []
    pending.forEach(item => item.resolve(false))
    emit()
  }, [])

  if (!confirmation) return null
  const destructive = /\b(delete|remove|cancel|deactivate|suspend|terminate|reverse)\b/i.test(confirmation.message)
  const Icon = destructive ? AlertTriangle : Info
  const finish = (confirmed: boolean | string | null) => {
    if (snapshot() !== confirmation) return
    confirmations = confirmations.slice(1)
    confirmation.resolve(confirmed)
    emit()
  }

  return (
    <Dialog.Root key={confirmation.id} open onOpenChange={open => { if (!open) finish(false) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[11000] bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[11001] w-[calc(100%-2rem)] max-w-[480px] max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-card p-6 text-card-foreground shadow-2xl outline-none"
          onOpenAutoFocus={event => { event.preventDefault(); (inputRef.current || cancelRef.current)?.focus() }}
        >
          <div className="mb-4 flex items-center gap-3">
            <div className={destructive ? 'rounded-lg bg-amber-100 p-3 text-amber-700' : 'rounded-lg bg-sky-100 p-3 text-sky-700'}><Icon className="h-5 w-5" /></div>
            <div className="min-w-0"><p className="mb-1 text-xs font-medium text-muted-foreground">JibuSales</p><Dialog.Title className="text-lg font-semibold">{confirmation.inputType ? 'Enter details' : 'Confirm action'}</Dialog.Title></div>
          </div>
          <Dialog.Description className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{sanitizeNotificationText(confirmation.message)}</Dialog.Description>
          <form onSubmit={event => { event.preventDefault(); finish(confirmation.inputType ? inputRef.current?.value ?? '' : true) }}>
            {confirmation.inputType && <input ref={inputRef} type={confirmation.inputType} step={confirmation.inputType === 'number' ? 'any' : undefined} required autoComplete={confirmation.inputType === 'password' ? 'new-password' : 'off'} aria-label={sanitizeNotificationText(confirmation.message)} className="mt-4 h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" ref={cancelRef} className={buttonVariants({ variant: 'outline' })} onClick={() => finish(false)}>Cancel</button>
              <Button type="submit" variant={destructive ? 'destructive' : 'default'}>Confirm</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
