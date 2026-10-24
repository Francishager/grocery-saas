import { apiFetch } from '@/lib/api'

export interface TransactionReceiptData {
  title: string
  reference: string
  date: string | Date
  amount: number
  currency?: string
  partyLabel?: string
  partyName?: string
  amountLabel?: string
  itemsLabel?: string
  items?: Array<{ name: string; quantity: number; unitName?: string; unitPrice: number; discount?: number; total: number }>
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
    const printableItems = (data.items || []).filter(item => item.name)
    const itemRows = printableItems.map(item => `<tr><td>${escapeHtml(item.name)}${item.unitName ? ` <span class="muted">(${escapeHtml(item.unitName)})</span>` : ''}</td><td>${Number(item.quantity || 0).toLocaleString()}</td><td>${Number(item.unitPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td>${Number(item.discount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td>${Number(item.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>`).join('')
    const itemsHtml = itemRows ? `<table class="items"><thead><tr><th>${escapeHtml(data.itemsLabel || 'Item')}</th><th>Qty</th><th>Unit price</th><th>Discount</th><th>${data.itemsLabel ? 'Line total' : 'Total'}</th></tr></thead><tbody>${itemRows}</tbody></table>` : ''
    const logo = business.logo ? `<img class="logo" src="${escapeHtml(business.logo)}" alt="">` : ''
    const amount = `${escapeHtml(data.currency || business.currency || 'UGX')} ${Number(data.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const date = new Date(data.date)

    printWindow.document.open()
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(data.title)} ${escapeHtml(data.reference)}</title><style>
      *{box-sizing:border-box}body{font:15px Arial,sans-serif;color:#17212b;margin:0;padding:28px;background:#fff}.receipt{max-width:760px;margin:0 auto}.brand{text-align:center;border-bottom:2px solid #17212b;padding-bottom:16px;margin-bottom:20px}.logo{display:block;max-width:120px;max-height:64px;object-fit:contain;margin:0 auto 10px}.business{font-size:22px;font-weight:700}.muted{color:#5f6b76;font-size:12px;margin-top:4px}.kind{text-align:center;color:#5f6b76;text-transform:uppercase;font-size:12px;letter-spacing:.08em}.reference{text-align:center;font-size:15px;font-weight:700;margin:7px 0}.amount{text-align:right;font-size:24px;font-weight:700;margin:18px 0}.amount-label{display:block;color:#5f6b76;font-size:12px;font-weight:500;margin-bottom:3px}.row{display:flex;justify-content:space-between;gap:24px;border-bottom:1px solid #e3e8ec;padding:10px 0}.row span{color:#5f6b76}.row strong{text-align:right;overflow-wrap:anywhere}.items{width:100%;border-collapse:collapse;margin:20px 0}.items th,.items td{text-align:right;border-bottom:1px solid #e3e8ec;padding:9px 6px;font-size:12px}.items th:first-child,.items td:first-child{text-align:left}.items th{background:#f3f6f8}.footer{text-align:center;margin-top:28px;color:#5f6b76;font-size:11px}@media print{body{padding:12mm}.receipt{max-width:100%}}
    </style></head><body><main class="receipt"><header class="brand">${logo}<div class="business">${escapeHtml(business.name || 'Business')}</div>${business.address ? `<div class="muted">${escapeHtml(business.address)}</div>` : ''}${business.phone ? `<div class="muted">${escapeHtml(business.phone)}</div>` : ''}${business.email ? `<div class="muted">${escapeHtml(business.email)}</div>` : ''}</header><div class="kind">${escapeHtml(data.title)}</div><div class="reference">${escapeHtml(data.reference)}</div>${data.partyName ? `<div class="row"><span>${escapeHtml(data.partyLabel || 'Party')}</span><strong>${escapeHtml(data.partyName)}</strong></div>` : ''}<div class="row"><span>Date</span><strong>${Number.isNaN(date.getTime()) ? '' : escapeHtml(date.toLocaleString())}</strong></div>${itemsHtml}<div class="amount">${data.amountLabel ? `<span class="amount-label">${escapeHtml(data.amountLabel)}</span>` : ''}${amount}</div>${details}<p class="footer">Reprint of a transaction recorded in JibuSales.</p></main><script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`)
    printWindow.document.close()
  })()

  return true
}
