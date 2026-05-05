// Workflow-related constants

export interface WorkflowStatus {
  id: string
  name: string
  color: string
  description?: string
}

export interface WorkflowPriority {
  id: string
  name: string
  color: string
  weight: number
}

export interface WorkflowType {
  id: string
  name: string
  description?: string
}

// Workflow statuses
export const workflowStatuses: WorkflowStatus[] = [
  { id: 'pending', name: 'Pending', color: 'yellow', description: 'Awaiting action' },
  { id: 'in_progress', name: 'In Progress', color: 'blue', description: 'Currently being processed' },
  { id: 'review', name: 'Under Review', color: 'purple', description: 'Awaiting review' },
  { id: 'approved', name: 'Approved', color: 'green', description: 'Approved, awaiting completion' },
  { id: 'rejected', name: 'Rejected', color: 'red', description: 'Rejected, needs revision' },
  { id: 'completed', name: 'Completed', color: 'green', description: 'Successfully completed' },
  { id: 'cancelled', name: 'Cancelled', color: 'gray', description: 'Workflow cancelled' },
  { id: 'on_hold', name: 'On Hold', color: 'orange', description: 'Temporarily paused' },
]

// Workflow priorities
export const workflowPriorities: WorkflowPriority[] = [
  { id: 'low', name: 'Low', color: 'gray', weight: 1 },
  { id: 'medium', name: 'Medium', color: 'yellow', weight: 2 },
  { id: 'high', name: 'High', color: 'orange', weight: 3 },
  { id: 'urgent', name: 'Urgent', color: 'red', weight: 4 },
  { id: 'critical', name: 'Critical', color: 'red', weight: 5 },
]

// Workflow types
export const workflowTypes: WorkflowType[] = [
  { id: 'approval', name: 'Approval Workflow', description: 'Multi-step approval process' },
  { id: 'review', name: 'Review Workflow', description: 'Content or document review' },
  { id: 'purchase', name: 'Purchase Order', description: 'Purchase order workflow' },
  { id: 'sale', name: 'Sales Order', description: 'Sales order workflow' },
  { id: 'return', name: 'Return Process', description: 'Product return workflow' },
  { id: 'transfer', name: 'Stock Transfer', description: 'Inventory transfer workflow' },
  { id: 'adjustment', name: 'Stock Adjustment', description: 'Inventory adjustment workflow' },
  { id: 'refund', name: 'Refund Process', description: 'Refund request workflow' },
  { id: 'custom', name: 'Custom Workflow', description: 'Custom workflow type' },
]

// Workflow status options for select
export const workflowStatusOptions = workflowStatuses.map((status) => ({
  value: status.id,
  label: status.name,
}))

// Workflow priority options for select
export const workflowPriorityOptions = workflowPriorities.map((priority) => ({
  value: priority.id,
  label: priority.name,
}))

// Workflow type options for select
export const workflowTypeOptions = workflowTypes.map((type) => ({
  value: type.id,
  label: type.name,
}))

// Workflow actions
export const workflowActions = [
  { id: 'start', name: 'Start', description: 'Start the workflow' },
  { id: 'submit', name: 'Submit', description: 'Submit for review' },
  { id: 'approve', name: 'Approve', description: 'Approve the workflow' },
  { id: 'reject', name: 'Reject', description: 'Reject the workflow' },
  { id: 'revise', name: 'Revise', description: 'Request revision' },
  { id: 'complete', name: 'Complete', description: 'Mark as completed' },
  { id: 'cancel', name: 'Cancel', description: 'Cancel the workflow' },
  { id: 'hold', name: 'Hold', description: 'Put on hold' },
  { id: 'resume', name: 'Resume', description: 'Resume from hold' },
  { id: 'delegate', name: 'Delegate', description: 'Delegate to another user' },
  { id: 'escalate', name: 'Escalate', description: 'Escalate to higher authority' },
]

// Default workflow settings
export const defaultWorkflowSettings = {
  autoAssign: true,
  notifyOnAssignment: true,
  notifyOnCompletion: true,
  allowDelegation: true,
  allowComments: true,
  requireApprovalNotes: false,
  maxEscalationLevel: 3,
  reminderInterval: 24, // hours
  autoRemind: true,
}

// Workflow transition rules
export const workflowTransitions: Record<string, string[]> = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['review', 'completed', 'on_hold', 'cancelled'],
  review: ['approved', 'rejected', 'in_progress'],
  approved: ['completed', 'rejected'],
  rejected: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
  on_hold: ['in_progress', 'cancelled'],
}

// Get workflow status by ID
export const getWorkflowStatusById = (id: string): WorkflowStatus | undefined => {
  return workflowStatuses.find((status) => status.id === id)
}

// Get workflow priority by ID
export const getWorkflowPriorityById = (id: string): WorkflowPriority | undefined => {
  return workflowPriorities.find((priority) => priority.id === id)
}

// Get workflow type by ID
export const getWorkflowTypeById = (id: string): WorkflowType | undefined => {
  return workflowTypes.find((type) => type.id === id)
}

// Check if transition is valid
export const isValidTransition = (fromStatus: string, toStatus: string): boolean => {
  const allowedTransitions = workflowTransitions[fromStatus]
  return allowedTransitions?.includes(toStatus) || false
}

// Get allowed transitions
export const getAllowedTransitions = (currentStatus: string): string[] => {
  return workflowTransitions[currentStatus] || []
}

export default workflowStatuses
