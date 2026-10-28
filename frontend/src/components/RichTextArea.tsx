import { useEffect, useRef } from 'react'
import { Bold } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/components/ui/button'

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function markdownToHtml(value: string) {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')
}

function htmlToMarkdown(html: string) {
  const document = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const read = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const element = node as HTMLElement
    if (element.tagName === 'BR') return '\n'
    const content = Array.from(element.childNodes).map(read).join('')
    if (element.tagName === 'STRONG' || element.tagName === 'B') return `**${content}**`
    if (['DIV', 'P'].includes(element.tagName)) return `${content}\n`
    return content
  }
  return Array.from(document.body.childNodes).map(read).join('').replace(/\n{3,}/g, '\n\n').replace(/\n$/, '')
}

export function RichTextArea({ id, value, onChange, placeholder, maxLength = 5000, className = '' }: {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
  className?: string
}) {
  const editor = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = editor.current
    if (element && htmlToMarkdown(element.innerHTML) !== value) element.innerHTML = markdownToHtml(value)
  }, [value])

  const update = () => {
    const element = editor.current
    if (!element) return
    const next = htmlToMarkdown(element.innerHTML).slice(0, maxLength)
    if (next !== htmlToMarkdown(element.innerHTML)) element.innerHTML = markdownToHtml(next)
    onChange(next)
  }

  const toggleBold = () => {
    editor.current?.focus()
    document.execCommand('bold')
    update()
  }

  return <div className={`overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${className}`}>
    <div className="flex border-b px-1 py-1">
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Bold selected text" aria-label="Bold selected text" onMouseDown={event => event.preventDefault()} onClick={toggleBold}><Bold className="h-4 w-4" /></Button>
    </div>
    <div id={id} ref={editor} role="textbox" aria-label={placeholder || 'Formatted text'} aria-multiline="true" contentEditable suppressContentEditableWarning onInput={update} className="min-h-24 whitespace-pre-wrap break-words px-3 py-2 text-sm outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground" data-placeholder={placeholder} />
  </div>
}

export function RichTextDisplay({ value, className = '' }: { value: string; className?: string }) {
  return <div className={`break-words ${className}`}><ReactMarkdown components={{
    p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  }}>{value}</ReactMarkdown></div>
}
