import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface CreatableProductAttributeProps {
  id: string
  label: string
  value: string
  options: string[]
  placeholder?: string
  onChange: (value: string) => void
}

const normalizeOption = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ')

export default function CreatableProductAttribute({
  id,
  label,
  value,
  options,
  placeholder = 'Choose or type a value',
  onChange,
}: CreatableProductAttributeProps) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const availableOptions = useMemo(() => {
    const seen = new Set<string>()
    return options.map(normalizeOption).filter(option => {
      const key = option.toLocaleLowerCase()
      if (!option || seen.has(key)) return false
      seen.add(key)
      return true
    }).sort((a, b) => a.localeCompare(b))
  }, [options])
  const normalizedQuery = normalizeOption(query)
  const filteredOptions = availableOptions.filter(option => option.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const exactMatch = availableOptions.some(option => option.toLocaleLowerCase() === normalizedQuery.toLocaleLowerCase())

  useEffect(() => {
    if (!open) setQuery(value)
  }, [value, open])

  const chooseValue = (nextValue: string) => {
    setQuery(nextValue)
    onChange(nextValue)
    setOpen(false)
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label} <span className="text-muted-foreground">(optional)</span></Label>
      <div className="relative">
        <div className="relative">
          <Input
            id={id}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={`${id}-options`}
            value={query}
            onFocus={() => setOpen(true)}
            onChange={event => {
              setQuery(event.target.value)
              onChange(event.target.value)
              setOpen(true)
            }}
            onKeyDown={event => {
              if (event.key === 'Escape') setOpen(false)
              if (event.key === 'Enter' && open && normalizedQuery) {
                event.preventDefault()
                chooseValue(normalizedQuery)
              }
            }}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            placeholder={placeholder}
            autoComplete="off"
          />
          <ChevronDown aria-hidden="true" className={cn('pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </div>
        {open && (
          <div id={`${id}-options`} role="listbox" aria-label={`${label} options`} className="absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
            {filteredOptions.map(option => (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={option.toLocaleLowerCase() === normalizedQuery.toLocaleLowerCase()}
                onMouseDown={event => event.preventDefault()}
                onClick={() => chooseValue(option)}
                className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <Check className={cn('h-4 w-4', option.toLocaleLowerCase() === normalizedQuery.toLocaleLowerCase() ? 'opacity-100' : 'opacity-0')} />
                <span className="break-words">{option}</span>
              </button>
            ))}
            {normalizedQuery && !exactMatch && (
              <button
                type="button"
                role="option"
                aria-selected="false"
                onMouseDown={event => event.preventDefault()}
                onClick={() => chooseValue(normalizedQuery)}
                className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-primary hover:bg-accent"
              >
                <Plus className="h-4 w-4" />
                Create “{normalizedQuery}”
              </button>
            )}
            {!filteredOptions.length && !normalizedQuery && (
              <p className="px-3 py-2 text-sm text-muted-foreground">No saved values yet. Type to create the first option.</p>
            )}
            {!filteredOptions.length && normalizedQuery && exactMatch && (
              <p className="px-3 py-2 text-sm text-muted-foreground">This saved value is selected.</p>
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {availableOptions.length ? 'Choose a saved value or type and create a new one.' : 'No saved values yet; enter a value to create the first option.'}
      </p>
    </div>
  )
}
