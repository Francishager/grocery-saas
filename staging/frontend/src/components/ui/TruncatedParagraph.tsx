import React, { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

export interface TruncatedParagraphProps {
  /** Text content */
  children: string
  /** Maximum number of lines */
  maxLines?: number
  /** Maximum character count */
  maxChars?: number
  /** Whether to show expand/collapse */
  expandable?: boolean
  /** Expand button text */
  expandText?: string
  /** Collapse button text */
  collapseText?: string
  /** Whether to show ellipsis */
  showEllipsis?: boolean
  /** Additional className */
  className?: string
  /** Text size */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Text color */
  color?: string
  /** Line height */
  lineHeight?: number
}

const sizeClasses = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
}

export const TruncatedParagraph: React.FC<TruncatedParagraphProps> = ({
  children,
  maxLines = 3,
  maxChars,
  expandable = true,
  expandText = 'Show more',
  collapseText = 'Show less',
  showEllipsis = true,
  className,
  size = 'sm',
  color = 'text-gray-600',
  lineHeight = 1.5,
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [needsTruncation, setNeedsTruncation] = useState(false)
  const textRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (textRef.current) {
      const element = textRef.current
      
      if (maxChars) {
        setNeedsTruncation(children.length > maxChars)
      } else if (maxLines) {
        const lineHeightPx = parseFloat(getComputedStyle(element).lineHeight)
        const maxHeight = lineHeightPx * maxLines
        setNeedsTruncation(element.scrollHeight > maxHeight)
      }
    }
  }, [children, maxLines, maxChars])

  const getDisplayText = () => {
    if (isExpanded) return children
    if (maxChars && children.length > maxChars) {
      return children.slice(0, maxChars) + (showEllipsis ? '...' : '')
    }
    return children
  }

  const lineClampStyle = !isExpanded && !maxChars && maxLines ? {
    display: '-webkit-box',
    WebkitLineClamp: maxLines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    lineHeight,
  } : {}

  return (
    <div className={cn('inline', className)}>
      <p
        ref={textRef}
        className={cn(sizeClasses[size], color)}
        style={lineClampStyle}
      >
        {getDisplayText()}
      </p>

      {expandable && needsTruncation && (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-primary text-sm font-medium hover:underline mt-1"
        >
          {isExpanded ? collapseText : expandText}
        </button>
      )}
    </div>
  )
}

export default TruncatedParagraph
