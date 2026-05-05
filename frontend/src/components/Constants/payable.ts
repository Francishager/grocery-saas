// Payable-related constants

export interface PayableStatus {
  id: string
  name: string
  color: string
  description?: string
}

export interface PaymentMethod {
  id: string
  name: string
  icon?: string
}

// Payable statuses
export const payableStatuses: PayableStatus[] = [
  { id: 'pending', name: 'Pending', color: 'yellow', description: 'Awaiting payment' },
  { id: 'partial', name: 'Partially Paid', color: 'blue', description: 'Partially paid' },
  { id: 'paid', name: 'Paid', color: 'green', description: 'Fully paid' },
  { id: 'overdue', name: 'Overdue', color: 'red', description: 'Past due date' },
  { id: 'cancelled', name: 'Cancelled', color: 'gray', description: 'Payment cancelled' },
]

// Payment methods
export const paymentMethods: PaymentMethod[] = [
  { id: 'cash', name: 'Cash', icon: '💵' },
  { id: 'bank_transfer', name: 'Bank Transfer', icon: '🏦' },
  { id: 'mobile_money', name: 'Mobile Money', icon: '📱' },
  { id: 'cheque', name: 'Cheque', icon: '📝' },
  { id: 'credit_card', name: 'Credit Card', icon: '💳' },
  { id: 'debit_card', name: 'Debit Card', icon: '💳' },
]

// Payable status options for select
export const payableStatusOptions = payableStatuses.map((status) => ({
  value: status.id,
  label: status.name,
}))

// Payment method options for select
export const paymentMethodOptions = paymentMethods.map((method) => ({
  value: method.id,
  label: `${method.icon} ${method.name}`,
}))

// Payable types
export const payableTypes = [
  { value: 'supplier', label: 'Supplier Invoice' },
  { value: 'expense', label: 'Expense' },
  { value: 'salary', label: 'Salary Payment' },
  { value: 'tax', label: 'Tax Payment' },
  { value: 'utility', label: 'Utility Bill' },
  { value: 'rent', label: 'Rent Payment' },
  { value: 'other', label: 'Other' },
]

// Payable priority levels
export const payablePriorities = [
  { value: 'low', label: 'Low', color: 'gray' },
  { value: 'medium', label: 'Medium', color: 'yellow' },
  { value: 'high', label: 'High', color: 'orange' },
  { value: 'urgent', label: 'Urgent', color: 'red' },
]

// Default payable settings
export const defaultPayableSettings = {
  autoRemind: true,
  remindDaysBefore: 3,
  allowPartialPayment: true,
  maxPaymentDays: 90,
}

// Get payable status by ID
export const getPayableStatusById = (id: string): PayableStatus | undefined => {
  return payableStatuses.find((status) => status.id === id)
}

// Get payment method by ID
export const getPaymentMethodById = (id: string): PaymentMethod | undefined => {
  return paymentMethods.find((method) => method.id === id)
}

// Calculate payable totals
export const calculatePayableTotals = (payables: Array<{ amount: number; paid: number }>) => {
  const totalAmount = payables.reduce((sum, p) => sum + p.amount, 0)
  const totalPaid = payables.reduce((sum, p) => sum + p.paid, 0)
  const totalOutstanding = totalAmount - totalPaid

  return {
    totalAmount,
    totalPaid,
    totalOutstanding,
  }
}

export default payableStatuses
