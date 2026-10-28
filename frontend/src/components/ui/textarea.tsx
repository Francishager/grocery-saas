import * as React from "react"

import { cn } from "@/lib/utils"
import { AIWritingAssist } from "@/components/AIWritingAssist"

type TextareaProps = React.ComponentProps<"textarea"> & { aiWritingField?: boolean }

function Textarea({ className, aiWritingField = false, ...props }: TextareaProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const textarea = (
    <textarea
      ref={textareaRef}
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )

  if (!aiWritingField) return textarea

  const applyDraft = (value: string) => {
    const element = textareaRef.current
    if (!element || element.disabled || element.readOnly) return
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }

  return <div className="space-y-1.5"><div className="flex justify-end empty:hidden"><AIWritingAssist module="general" field="business text" onUse={applyDraft} /></div>{textarea}</div>
}

export { Textarea }
