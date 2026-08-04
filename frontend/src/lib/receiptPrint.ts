import type { ReceiptPreview } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'

type ReceiptLoader = ReceiptPreview | (() => Promise<ReceiptPreview>)

export function printReceiptInBrowser(receiptOrLoader: ReceiptLoader, receiptNo = 'Receipt'): boolean {
  const printWindow = window.open('', '_blank', 'width=420,height=740')
  if (!printWindow) return false

  writePrintWindow(printWindow, loadingHtml(receiptNo))

  const loadReceipt =
    typeof receiptOrLoader === 'function'
      ? receiptOrLoader
      : async () => receiptOrLoader

  loadReceipt()
    .then((receipt) => {
      writePrintWindow(printWindow, receiptHtml(receipt))
      printWindow.focus()
      window.setTimeout(() => printWindow.print(), 250)
    })
    .catch((error) => {
      writePrintWindow(printWindow, errorHtml(error?.message || 'Failed to load receipt'))
    })

  return true
}

function writePrintWindow(printWindow: Window, html: string) {
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
}

function receiptHtml(receipt: ReceiptPreview): string {
  const business = receipt.business || { name: 'Business' }
  const cashier = receipt.cashier || '-'
  const paymentMethod = receipt.paymentMethod || 'cash'

  return baseHtml(`
    <main class="receipt">
      <section class="center">
        ${business.logo ? `<img class="logo" src="${escapeAttr(business.logo)}" alt="Logo">` : ''}
        <h1>${escapeHtml(business.name || 'Business')}</h1>
        ${business.address ? `<p>${escapeHtml(business.address)}</p>` : ''}
        ${business.phone ? `<p>Tel: ${escapeHtml(business.phone)}</p>` : ''}
        ${business.email ? `<p>${escapeHtml(business.email)}</p>` : ''}
        ${receipt.branch?.name ? `<p>Branch: ${escapeHtml(receipt.branch.name)}</p>` : ''}
      </section>

      <div class="dash"></div>

      <section class="meta">
        ${row('Receipt', receipt.receiptNo)}
        ${row('Date', new Date(receipt.createdAt).toLocaleString())}
        ${row('Cashier', cashier)}
        ${row('Payment', paymentMethod.toUpperCase())}
      </section>

      <div class="dash"></div>

      <section class="items">
        ${receipt.items.map(itemHtml).join('')}
      </section>

      <div class="dash"></div>

      <section class="totals">
        ${row('Subtotal', formatCurrency(receipt.subtotal))}
        ${receipt.discount > 0 ? row('Discount', formatCurrency(receipt.discount)) : ''}
        ${receipt.tax > 0 ? row('Tax', formatCurrency(receipt.tax)) : ''}
        ${row('TOTAL', formatCurrency(receipt.total), 'total')}
        ${receipt.amountPaid != null ? row('Amount Paid', formatCurrency(receipt.amountPaid)) : ''}
        ${receipt.amountPaid != null ? row('Change', formatCurrency(receipt.changeGiven || 0)) : ''}
      </section>

      <div class="dash"></div>

      <section class="center">
        ${business.receiptHeader ? `<p>${escapeHtml(business.receiptHeader)}</p>` : ''}
        <p>Thank you for your purchase!</p>
        ${business.receiptFooter ? `<p>${escapeHtml(business.receiptFooter)}</p>` : ''}
        <p class="powered">Powered by JibuSales</p>
      </section>
    </main>
  `)
}

function itemHtml(item: ReceiptPreview['items'][number]): string {
  return `
    <div class="item">
      <div class="item-name">${escapeHtml(item.name || 'Item')}</div>
      <div class="line">
        <span>${escapeHtml(String(item.quantity))} x ${escapeHtml(formatCurrency(item.price))}</span>
        <strong>${escapeHtml(formatCurrency(item.total))}</strong>
      </div>
    </div>
  `
}

function row(label: string, value: string, className = ''): string {
  return `
    <div class="line ${className}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `
}

function loadingHtml(receiptNo: string): string {
  return baseHtml(`
    <main class="receipt center">
      <h1>Preparing receipt</h1>
      <p>Preparing ${escapeHtml(receiptNo)}...</p>
    </main>
  `)
}

function errorHtml(message: string): string {
  return baseHtml(`
    <main class="receipt center">
      <h1>Print Error</h1>
      <p>${escapeHtml(message)}</p>
    </main>
  `)
}

function baseHtml(content: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Receipt</title>
    <style>
      @page { size: 58mm auto; margin: 3mm; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; color: #000; background: #fff; }
      body { font-family: "Courier New", Courier, monospace; font-size: 10px; line-height: 1.28; }
      .receipt { width: 52mm; max-width: 100%; margin: 0 auto; overflow-wrap: anywhere; }
      .center { text-align: center; }
      h1 { margin: 0 0 4px; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.15; }
      p { margin: 1px 0; }
      .logo { display: block; width: 40px; height: 40px; object-fit: contain; margin: 0 auto 4px; }
      .dash { border-top: 1px dashed #000; margin: 7px 0; }
      .line { display: flex; align-items: flex-start; justify-content: space-between; gap: 6px; margin: 2px 0; }
      .line strong { max-width: 29mm; text-align: right; white-space: normal; overflow-wrap: anywhere; }
      .item { margin: 0 0 6px; }
      .item-name { font-weight: 700; overflow-wrap: anywhere; }
      .total { border-top: 1px solid #000; margin-top: 5px; padding-top: 5px; font-size: 12px; }
      .powered { font-size: 9px; }
      @media screen {
        body { background: #f3f4f6; padding: 12px; }
        .receipt { background: #fff; padding: 10px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18); }
      }
      @media print {
        body { padding: 0; }
        .receipt { width: 52mm; padding: 0; box-shadow: none; }
      }
    </style>
  </head>
  <body>${content}</body>
</html>`
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#096;')
}
