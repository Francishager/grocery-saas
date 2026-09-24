import { Bell, CircleCheck, TriangleAlert, Package, Clock, TrendingDown, FileText, ShoppingCart, CreditCard, Users, UserRound, Wallet, Wrench, Receipt, ArrowLeftRight, UserCheck, CircleDollarSign, Truck, BriefcaseBusiness, Settings2 } from 'lucide-react'

const icons: Record<string, typeof Bell> = {
  info: Bell, success: CircleCheck, warning: TriangleAlert, error: TriangleAlert,
  sale: ShoppingCart, purchase: Truck, payment: CreditCard, expense: Wallet,
  payroll: BriefcaseBusiness, inventory: Package, low_stock: Package, out_of_stock: Package,
  overdue_rental: Clock, overdue_payable: TrendingDown, leave_request: FileText,
  hr: Users, service: Wrench, job_card: Receipt, receivable: CircleDollarSign,
  payable: CircleDollarSign, refund: ArrowLeftRight, transfer: ArrowLeftRight,
  account: Settings2, customer: UserRound, supplier: Truck, user: UserRound,
  approval: UserCheck, system: Settings2, communication: Bell,
}

export function NotificationIcon({ type = 'info', className = 'h-5 w-5' }: { type?: string; className?: string }) {
  const Icon = icons[type] || Bell
  return <Icon className={className} aria-hidden="true" />
}
