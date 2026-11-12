import React, { useState, useRef, useEffect } from 'react'

export const DropdownMenu: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative inline-block">
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as any, { open, setOpen })
          : child
      )}
    </div>
  )
}

interface DropdownMenuTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  open?: boolean
  setOpen?: (open: boolean) => void
  asChild?: boolean
}

export const DropdownMenuTrigger: React.FC<DropdownMenuTriggerProps> = ({
  children,
  open,
  setOpen,
  asChild = false,
  className = '',
  ...props
}) => {
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    props.onClick?.(event)
    if (!event.defaultPrevented) setOpen?.(!open)
  }

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<any>
    const childOnClick = child.props.onClick as ((event: React.MouseEvent) => void) | undefined
    return React.cloneElement(child, {
      ...props,
      type: 'button',
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
        childOnClick?.(event)
        handleClick(event)
      },
      'aria-haspopup': 'menu',
      'aria-expanded': Boolean(open),
    })
  }

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-gray-100 transition-colors ${className}`}
      type="button"
      aria-haspopup="menu"
      aria-expanded={Boolean(open)}
      {...props}
    >
      {children}
    </button>
  )
}

interface DropdownMenuContentProps {
  children: React.ReactNode
  open?: boolean
  setOpen?: (open: boolean) => void
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
  className?: string
}

export const DropdownMenuContent: React.FC<DropdownMenuContentProps> = ({
  children,
  open,
  setOpen,
  align = 'end',
  sideOffset = 8,
  className = '',
}) => {
  if (!open) return null

  return (
    <div
      role="menu"
      className={`absolute z-50 w-48 rounded-md border border-border bg-popover text-popover-foreground shadow-lg ${align === 'start' ? 'left-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'right-0'} ${className}`}
      style={{ marginTop: sideOffset }}
    >
      {React.Children.map(children, child => React.isValidElement(child)
        ? React.cloneElement(child as React.ReactElement<any>, { setOpen })
        : child)}
    </div>
  )
}

interface DropdownMenuItemProps {
  children: React.ReactNode
  onClick?: () => void
  onSelect?: () => void
  className?: string
  setOpen?: (open: boolean) => void
  disabled?: boolean
}

export const DropdownMenuItem: React.FC<DropdownMenuItemProps> = ({
  children,
  onClick,
  onSelect,
  className = '',
  setOpen,
  disabled = false,
}) => {
  return (
    <button
      role="menuitem"
      onClick={() => { onClick?.(); onSelect?.(); setOpen?.(false) }}
      disabled={disabled}
      className={`w-full text-left px-4 py-2 hover:bg-accent hover:text-accent-foreground transition-colors text-sm disabled:pointer-events-none disabled:opacity-50 ${className}`}
      type="button"
    >
      {children}
    </button>
  )
}
