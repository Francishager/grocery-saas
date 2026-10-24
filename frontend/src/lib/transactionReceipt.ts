import { apiFetch } from '@/lib/api'

export interface TransactionReceiptData {
  title: string
  reference: string
  date: string | Date
  amount: number
  currency?: string
  partyLabel?: string
  partyName?: string
  fields?: Array<{ label: string; value?: string | number | null }>
}

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

export function printTransactionReceipt(data: TransactionReceiptData): boolean {
  const printWindow = window.open('', '_blank', 'width=820,height=900')
  if (!printWindow) return false

  printWindow.document.open()
  printWindow.document.write('<!doctype html><html><head><title>Preparing receipt</title></head><body>Preparing receipt…</body></html>')
  printWindow.document.close()

  void (async () => {
    let business: any = {}
    try {
      const response = await apiFetch('/api/settings/business-profile')
      if (response.ok) business = await response.json()
    } catch { /* Receipt remains printable if profile lookup is temporarily unavailable. */ }

    const fields = (data.fields || []).filter(field => field.value !== undefined && field.value !== null && field.value !== '')
    const details = fields.map(field => `<div class="row"><span>${escapeHtml(field.label)}</span><strong>${escapeHtml(field.value)}</strong></div>`).join('')
    const logo = business.logo ? `<img class="logo" src="${escapeHtml(business.logo)}" alt="">` : ''
    const amount = `${escapeHtml(data.currency || business.currency || 'UGX')} ${Number(data.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const date = new Date(data.date)

    printWindow.document.open()
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(data.title)} ${escapeHtml(data.reference)}</title><style>
      *{box-sizing:border-box}body{font:15px Arial,sans-serif;color:#17212b;margin:0;padding:28px;background:#fff}.receipt{max-width:680px;margin:0 auto}.brand{text-align:center;border-bottom:2px solid #17212b;padding-bottom:16px;margin-bottom:20px}.logo{display:block;max-width:120px;max-height:64px;object-fit:contain;margin:0 auto 10px}.business{font-size:22px;font-weight:700}.muted{color:#5f6b76;font-size:12px;margin-top:4px}.kind{text-align:center;color:#5f6b76;text-transform:uppercase;font-size:12px;letter-spacing:.08em}.reference{text-align:center;font-size:15px;font-weight:700;margin:7px 0}.amount{text-align:center;font-size:28px;font-weight:700;margin:20px 0}.row{display:flex;justify-content:space-between;gap:24px;border-bottom:1px solid #e3e8ec;padding:10px 0}.row span{color:#5f6b76}.row strong{text-align:right;overflow-wrap:anywhere}.footer{text-align:center;margin-top:28px;color:#5f6b76;font-size:11px}@media print{body{padding:12mm}.receipt{max-width:100%}}
    </style></head><body><main class="receipt"><header class="brand">${logo}<div class="business">${escapeHtml(business.name || 'Business')}</div>${business.address ? `<div class="muted">${escapeHtml(business.address)}</div>` : ''}${business.phone ? `<div class="muted">${escapeHtml(business.phone)}</div>` : ''}${business.email ? `<div class="muted">${escapeHtml(business.email)}</div>` : ''}</header><div class="kind">${escapeHtml(data.title)}</div><div class="reference">${escapeHtml(data.reference)}</div><div class="amount">${amount}</div>${data.partyName ? `<div class="row"><span>${escapeHtml(data.partyLabel || 'Party')}</span><strong>${escapeHtml(data.partyName)}</strong></div>` : ''}<div class="row"><span>Date</span><strong>${Number.isNaN(date.getTime()) ? '' : escapeHtml(date.toLocaleString())}</strong></div>${details}<p class="footer">Reprint of a transaction recorded in JibuSales.</p></main><script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`)
    printWindow.document.close()
  })()

  return true
}
