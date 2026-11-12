// Receivable-related constants

export interface ReceivableStatus {
  id: string
  name: string
  color: string
  description?: string
}

export interface ReceivableType {
  id: string
  name: string
  description?: string
}

// Receivable statuses
export const receivableStatuses: ReceivableStatus[] = [
  { id: 'pending', name: 'Pending', color: 'yellow', description: 'Awaiting payment' },
  { id: 'partial', name: 'Partially Paid', color: 'blue', description: 'Partially paid' },
  { id: 'paid', name: 'Paid', color: 'green', description: 'Fully paid' },
  { id: 'overdue', name: 'Overdue', color: 'red', description: 'Past due date' },
  { id: 'bad_debt', name: 'Bad Debt', color: 'gray', description: 'Written off as bad debt' },
  { id: 'disputed', name: 'Disputed', color: 'orange', description: 'Under dispute' },
]

// Receivable types
export const receivableTypes: ReceivableType[] = [
  { id: 'invoice', name: 'Invoice', description: 'Customer invoice' },
  { id: 'credit_sale', name: 'Credit Sale', description: 'Credit sale to customer' },
  { id: 'deposit', name: 'Deposit', description: 'Customer deposit' },
  { id: 'advance', name: 'Advance Payment', description: 'Advance from customer' },
  { id: 'other', name: 'Other', description: 'Other receivable' },
]

// Receivable status options for select
export const receivableStatusOptions = receivableStatuses.map((status) => ({
  value: status.id,
  label: status.name,
}))

// Receivable type options for select
export const receivableTypeOptions = receivableTypes.map((type) => ({
  value: type.id,
  label: type.name,
}))

// Aging periods for receivables
export const agingPeriods = [
  { value: 'current', label: 'Current (0-30 days)', minDays: 0, maxDays: 30 },
  { value: '31-60', label: '31-60 days', minDays: 31, maxDays: 60 },
  { value: '61-90', label: '61-90 days', minDays: 61, maxDays: 90 },
  { value: '91-120', label: '91-120 days', minDays: 91, maxDays: 120 },
  { value: 'over-120', label: 'Over 120 days', minDays: 121, maxDays: null },
]

// Default receivable settings
export const defaultReceivableSettings = {
  autoRemind: true,
  remindDaysBefore: 3,
  creditLimit: 1000000,
  maxCreditDays: 30,
  enableInterest: false,
  interestRate: 0,
  gracePeriod: 5,
}

// Collection actions
export const collectionActions = [
  { value: 'reminder', label: 'Send Reminder' },
  { value: 'call', label: 'Phone Call' },
  { value: 'visit', label: 'Site Visit' },
  { value: 'letter', label: 'Demand Letter' },
  { value: 'legal', label: 'Legal Action' },
  { value: 'write_off', label: 'Write Off' },
]

// Get receivable status by ID
export const getReceivableStatusById = (id: string): ReceivableStatus | undefined => {
  return receivableStatuses.find((status) => status.id === id)
}

// Get receivable type by ID
export const getReceivableTypeById = (id: string): ReceivableType | undefined => {
  return receivableTypes.find((type) => type.id === id)
}

// Calculate aging bucket
export const getAgingBucket = (days: number): string => {
  for (const period of agingPeriods) {
    if (period.maxDays === null && days >= period.minDays) {
      return period.value
    }
    if (days >= period.minDays && days <= period.maxDays!) {
      return period.value
    }
  }
  return 'current'
}

// Calculate receivable totals
export const calculateReceivableTotals = (receivables: Array<{ amount: number; paid: number }>) => {
  const totalAmount = receivables.reduce((sum, r) => sum + r.amount, 0)
  const totalPaid = receivables.reduce((sum, r) => sum + r.paid, 0)
  const totalOutstanding = totalAmount - totalPaid

  return {
    totalAmount,
    totalPaid,
    totalOutstanding,
  }
}

export default receivableStatuses
