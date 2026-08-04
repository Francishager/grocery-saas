import type { ReceiptPreview } from '@/lib/api'

export interface ReceiptPreviewFallback {
  id?: string
  receiptNo?: string
  business?: Partial<ReceiptPreview['business']> & { name?: string }
  branch?: ReceiptPreview['branch']
  cashier?: string
  paymentMethod?: string
  createdAt?: string
  subtotal?: number
  discount?: number
  tax?: number
  total?: number
  amountPaid?: number | null
  changeGiven?: number | null
  items?: Array<{
    id?: string
    name?: string
    sku?: string | null
    quantity?: number
    price?: number
    total?: number
  }>
}

export function buildReceiptPreviewFromData(data: ReceiptPreviewFallback): ReceiptPreview {
  return {
    id: data.id || 'receipt-preview',
    receiptNo: data.receiptNo || 'Receipt',
    business: {
      name: data.business?.name || 'JibuSales',
      email: data.business?.email ?? null,
      phone: data.business?.phone ?? null,
      address: data.business?.address ?? null,
      logo: data.business?.logo ?? null,
      receiptHeader: data.business?.receiptHeader ?? null,
      receiptFooter: data.business?.receiptFooter ?? null,
    },
    branch: data.branch ?? null,
    cashier: data.cashier || '-',
    paymentMethod: data.paymentMethod || 'cash',
    createdAt: data.createdAt || new Date().toISOString(),
    subtotal: data.subtotal ?? 0,
    discount: data.discount ?? 0,
    tax: data.tax ?? 0,
    total: data.total ?? 0,
    amountPaid: data.amountPaid ?? null,
    changeGiven: data.changeGiven ?? null,
    items: (data.items || []).map((item, index) => ({
      id: item.id || `item-${index}`,
      name: item.name || 'Item',
      sku: item.sku ?? null,
      quantity: item.quantity ?? 0,
      price: item.price ?? 0,
      total: item.total ?? 0,
    })),
  }
}
