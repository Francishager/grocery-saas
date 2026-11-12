import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export interface Task {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number // 0-100
  message?: string
  error?: string
  startTime?: Date
  endTime?: Date
  data?: any
}

export interface TaskIndicatorContextValue {
  /** Active tasks */
  tasks: Task[]
  /** Whether any task is running */
  isRunning: boolean
  /** Overall progress (average of all running tasks) */
  overallProgress: number
  /** Add a new task */
  addTask: (task: Omit<Task, 'id' | 'status' | 'progress'>) => string
  /** Update task progress */
  updateProgress: (id: string, progress: number, message?: string) => void
  /** Complete a task */
  completeTask: (id: string, data?: any) => void
  /** Fail a task */
  failTask: (id: string, error: string) => void
  /** Cancel a task */
  cancelTask: (id: string) => void
  /** Remove a task */
  removeTask: (id: string) => void
  /** Clear all completed/failed tasks */
  clearCompleted: () => void
  /** Clear all tasks */
  clearAll: () => void
  /** Get task by ID */
  getTask: (id: string) => Task | undefined
  /** Run async task with automatic progress updates */
  runTask: <T>(
    name: string,
    taskFn: (updateProgress: (progress: number, message?: string) => void) => Promise<T>
  ) => Promise<T>
}

const TaskIndicatorContext = createContext<TaskIndicatorContextValue | undefined>(undefined)

let taskIdCounter = 0

const generateTaskId = (): string => {
  taskIdCounter += 1
  return `task-${Date.now()}-${taskIdCounter}`
}

export interface TaskIndicatorProviderProps {
  children: ReactNode
  /** Maximum number of tasks to keep in history */
  maxTasks?: number
  /** Auto-remove completed tasks after delay (ms) */
  autoRemoveDelay?: number
  /** Callback when task completes */
  onTaskComplete?: (task: Task) => void
  /** Callback when task fails */
  onTaskFail?: (task: Task) => void
}

export const TaskIndicatorProvider: React.FC<TaskIndicatorProviderProps> = ({
  children,
  maxTasks = 20,
  autoRemoveDelay = 5000,
  onTaskComplete,
  onTaskFail,
}) => {
  const [tasks, setTasks] = useState<Task[]>([])

  const isRunning = tasks.some((t) => t.status === 'running')

  const overallProgress = React.useMemo(() => {
    const runningTasks = tasks.filter((t) => t.status === 'running')
    if (runningTasks.length === 0) return 0
    const total = runningTasks.reduce((sum, t) => sum + t.progress, 0)
    return Math.round(total / runningTasks.length)
  }, [tasks])

  const addTask = useCallback((task: Omit<Task, 'id' | 'status' | 'progress'>): string => {
    const id = generateTaskId()
    const newTask: Task = {
      ...task,
      id,
      status: 'pending',
      progress: 0,
      startTime: new Date(),
    }

    setTasks((prev) => {
      if (prev.length >= maxTasks) {
        return [...prev.slice(1), newTask]
      }
      return [...prev, newTask]
    })

    return id
  }, [maxTasks])

  const updateProgress = useCallback((id: string, progress: number, message?: string) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? { ...task, status: 'running', progress: Math.min(100, Math.max(0, progress)), message }
          : task
      )
    )
  }, [])

  const completeTask = useCallback((id: string, data?: any) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? { ...task, status: 'completed', progress: 100, endTime: new Date(), data }
          : task
      )
    )

    const task = tasks.find((t) => t.id === id)
    if (task) {
      onTaskComplete?.({ ...task, status: 'completed', progress: 100, endTime: new Date(), data })
    }
  }, [tasks, onTaskComplete])

  const failTask = useCallback((id: string, error: string) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? { ...task, status: 'failed', error, endTime: new Date() }
          : task
      )
    )

    const task = tasks.find((t) => t.id === id)
    if (task) {
      onTaskFail?.({ ...task, status: 'failed', error, endTime: new Date() })
    }
  }, [tasks, onTaskFail])

  const cancelTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? { ...task, status: 'cancelled', endTime: new Date() }
          : task
      )
    )
  }, [])

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== id))
  }, [])

  const clearCompleted = useCallback(() => {
    setTasks((prev) => prev.filter((task) => task.status !== 'completed' && task.status !== 'failed'))
  }, [])

  const clearAll = useCallback(() => {
    setTasks([])
  }, [])

  const getTask = useCallback((id: string): Task | undefined => {
    return tasks.find((t) => t.id === id)
  }, [tasks])

  const runTask = useCallback(async <T,>(
    name: string,
    taskFn: (updateProgress: (progress: number, message?: string) => void) => Promise<T>
  ): Promise<T> => {
    const id = addTask({ name })

    // Start the task
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, status: 'running' } : task
      )
    )

    const updateProgressFn = (progress: number, message?: string) => {
      updateProgress(id, progress, message)
    }

    try {
      const result = await taskFn(updateProgressFn)
      completeTask(id, result)
      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Task failed'
      failTask(id, errorMessage)
      throw err
    }
  }, [addTask, updateProgress, completeTask, failTask])

  // Auto-remove completed/failed tasks
  React.useEffect(() => {
    if (autoRemoveDelay <= 0) return

    const completedIds = tasks
      .filter((t) => t.status === 'completed' || t.status === 'failed')
      .map((t) => t.id)

    if (completedIds.length === 0) return

    const timeoutId = setTimeout(() => {
      completedIds.forEach((id) => removeTask(id))
    }, autoRemoveDelay)

    return () => clearTimeout(timeoutId)
  }, [tasks, autoRemoveDelay, removeTask])

  const value: TaskIndicatorContextValue = {
    tasks,
    isRunning,
    overallProgress,
    addTask,
    updateProgress,
    completeTask,
    failTask,
    cancelTask,
    removeTask,
    clearCompleted,
    clearAll,
    getTask,
    runTask,
  }

  return (
    <TaskIndicatorContext.Provider value={value}>
      {children}
    </TaskIndicatorContext.Provider>
  )
}

export const useTaskIndicator = (): TaskIndicatorContextValue => {
  const context = useContext(TaskIndicatorContext)
  if (!context) {
    throw new Error('useTaskIndicator must be used within a TaskIndicatorProvider')
  }
  return context
}

export default TaskIndicatorContext
