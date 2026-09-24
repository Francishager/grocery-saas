export type NotificationVisual = {
  label: string
  color: string
  badge: string
}

const visuals: Record<string, NotificationVisual> = {
  info: { label: 'Information', color: 'bg-blue-100 text-blue-700', badge: 'bg-blue-100 text-blue-800' },
  success: { label: 'Success', color: 'bg-emerald-100 text-emerald-700', badge: 'bg-emerald-100 text-emerald-800' },
  warning: { label: 'Warning', color: 'bg-amber-100 text-amber-700', badge: 'bg-amber-100 text-amber-800' },
  error: { label: 'Attention', color: 'bg-red-100 text-red-700', badge: 'bg-red-100 text-red-800' },
  sale: { label: 'Sale', color: 'bg-emerald-100 text-emerald-700', badge: 'bg-emerald-100 text-emerald-800' },
  payment: { label: 'Payment', color: 'bg-cyan-100 text-cyan-700', badge: 'bg-cyan-100 text-cyan-800' },
  purchase: { label: 'Purchase', color: 'bg-sky-100 text-sky-700', badge: 'bg-sky-100 text-sky-800' },
  inventory: { label: 'Inventory', color: 'bg-violet-100 text-violet-700', badge: 'bg-violet-100 text-violet-800' },
  low_stock: { label: 'Low stock', color: 'bg-orange-100 text-orange-700', badge: 'bg-orange-100 text-orange-800' },
  out_of_stock: { label: 'Out of stock', color: 'bg-red-100 text-red-700', badge: 'bg-red-100 text-red-800' },
  overdue_rental: { label: 'Overdue rental', color: 'bg-purple-100 text-purple-700', badge: 'bg-purple-100 text-purple-800' },
  overdue_payable: { label: 'Overdue payable', color: 'bg-amber-100 text-amber-700', badge: 'bg-amber-100 text-amber-800' },
  leave_request: { label: 'Leave request', color: 'bg-indigo-100 text-indigo-700', badge: 'bg-indigo-100 text-indigo-800' },
  expense: { label: 'Expense', color: 'bg-rose-100 text-rose-700', badge: 'bg-rose-100 text-rose-800' },
  payroll: { label: 'Payroll', color: 'bg-fuchsia-100 text-fuchsia-700', badge: 'bg-fuchsia-100 text-fuchsia-800' },
  hr: { label: 'HR', color: 'bg-indigo-100 text-indigo-700', badge: 'bg-indigo-100 text-indigo-800' },
  service: { label: 'Service', color: 'bg-teal-100 text-teal-700', badge: 'bg-teal-100 text-teal-800' },
  job_card: { label: 'Job card', color: 'bg-teal-100 text-teal-700', badge: 'bg-teal-100 text-teal-800' },
  receivable: { label: 'Receivable', color: 'bg-blue-100 text-blue-700', badge: 'bg-blue-100 text-blue-800' },
  payable: { label: 'Payable', color: 'bg-orange-100 text-orange-700', badge: 'bg-orange-100 text-orange-800' },
  refund: { label: 'Refund', color: 'bg-pink-100 text-pink-700', badge: 'bg-pink-100 text-pink-800' },
  transfer: { label: 'Transfer', color: 'bg-slate-100 text-slate-700', badge: 'bg-slate-100 text-slate-800' },
  account: { label: 'Accounting', color: 'bg-slate-100 text-slate-700', badge: 'bg-slate-100 text-slate-800' },
  customer: { label: 'Customer', color: 'bg-lime-100 text-lime-700', badge: 'bg-lime-100 text-lime-800' },
  supplier: { label: 'Supplier', color: 'bg-yellow-100 text-yellow-700', badge: 'bg-yellow-100 text-yellow-800' },
  user: { label: 'User', color: 'bg-gray-100 text-gray-700', badge: 'bg-gray-100 text-gray-800' },
  approval: { label: 'Approval', color: 'bg-indigo-100 text-indigo-700', badge: 'bg-indigo-100 text-indigo-800' },
  system: { label: 'System', color: 'bg-gray-100 text-gray-700', badge: 'bg-gray-100 text-gray-800' },
  communication: { label: 'Communication', color: 'bg-blue-100 text-blue-700', badge: 'bg-blue-100 text-blue-800' },
}

export function getNotificationVisual(type?: string | null): NotificationVisual {
  return visuals[String(type || '').toLowerCase()] || visuals.info
}
