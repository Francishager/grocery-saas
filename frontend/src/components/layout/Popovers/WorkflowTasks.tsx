import React, { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { CheckCircle, Clock, AlertCircle, ListTodo, ChevronRight, X } from 'lucide-react'
import { createPortal } from 'react-dom'

export interface WorkflowTask {
  id: string
  title: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed' | 'blocked'
  priority: 'low' | 'medium' | 'high'
  dueDate?: Date | string
  assignee?: {
    name: string
    avatar?: string
  }
}

export interface WorkflowTasksProps {
  /** Tasks list */
  tasks?: WorkflowTask[]
  /** Callback when task is clicked */
  onTaskClick?: (task: WorkflowTask) => void
  /** Callback when task status is changed */
  onStatusChange?: (taskId: string, status: WorkflowTask['status']) => void
  /** Title */
  title?: string
  /** Maximum visible tasks */
  maxVisible?: number
  /** Additional className */
  className?: string
  /** Trigger element */
  trigger?: React.ReactNode
  /** Whether popover is open */
  open?: boolean
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void
}

const statusConfig = {
  pending: {
    icon: Clock,
    color: 'text-yellow-600 bg-yellow-100',
    label: 'Pending',
  },
  in_progress: {
    icon: Clock,
    color: 'text-blue-600 bg-blue-100',
    label: 'In Progress',
  },
  completed: {
    icon: CheckCircle,
    color: 'text-green-600 bg-green-100',
    label: 'Completed',
  },
  blocked: {
    icon: AlertCircle,
    color: 'text-red-600 bg-red-100',
    label: 'Blocked',
  },
}

const priorityColors = {
  low: 'border-l-gray-300',
  medium: 'border-l-yellow-500',
  high: 'border-l-red-500',
}

export const WorkflowTasks: React.FC<WorkflowTasksProps> = ({
  tasks = [],
  onTaskClick,
  onStatusChange,
  title = 'Workflow Tasks',
  maxVisible = 5,
  className,
  trigger,
  open: controlledOpen,
  onOpenChange,
}) => {
  const [internalOpen, setInternalOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen
  const pendingCount = tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress').length

  const handleToggle = () => {
    const newState = !isOpen
    setInternalOpen(newState)
    onOpenChange?.(newState)
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current?.contains(event.target as Node) ||
        triggerRef.current?.contains(event.target as Node)
      ) {
        return
      }
      setInternalOpen(false)
      onOpenChange?.(false)
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onOpenChange])

  const formatDate = (date: Date | string) => {
    const d = new Date(date)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const popoverContent = isOpen && (
    <div
      ref={popoverRef}
      className={cn(
        'fixed right-0 top-14 z-50 w-80 bg-white rounded-lg shadow-xl border border-gray-200',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        </div>
        <button
          type="button"
          onClick={() => {
            setInternalOpen(false)
            onOpenChange?.(false)
          }}
          className="p-1 text-gray-400 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tasks list */}
      <div className="max-h-96 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500">
            <CheckCircle className="h-8 w-8 mb-2" />
            <p className="text-sm">No pending tasks</p>
          </div>
        ) : (
          tasks.slice(0, maxVisible).map((task) => {
            const config = statusConfig[task.status]
            const StatusIcon = config.icon

            return (
              <div
                key={task.id}
                className={cn(
                  'p-4 border-l-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer',
                  priorityColors[task.priority]
                )}
                onClick={() => onTaskClick?.(task)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {task.title}
                    </p>
                    {task.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                        {task.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded',
                          config.color
                        )}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {config.label}
                      </span>
                      {task.dueDate && (
                        <span className="text-xs text-gray-400">
                          Due: {formatDate(task.dueDate)}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Footer */}
      {tasks.length > maxVisible && (
        <div className="px-4 py-3 border-t border-gray-200">
          <button
            type="button"
            className="w-full text-sm text-primary hover:underline"
          >
            View all tasks ({tasks.length})
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div ref={triggerRef} className="relative">
      {trigger ? (
        <div onClick={handleToggle}>{trigger}</div>
      ) : (
        <button
          type="button"
          onClick={handleToggle}
          className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          <ListTodo className="h-5 w-5" />
          {pendingCount > 0 && (
            <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] text-xs font-medium text-white bg-blue-500 rounded-full">
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
        </button>
      )}
      {popoverContent && createPortal(popoverContent, document.body)}
    </div>
  )
}

export default WorkflowTasks
