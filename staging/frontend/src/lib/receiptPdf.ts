import type { ReceiptPreview } from '@/lib/api'
import { formatCurrency, formatDisplayDate } from '@/lib/utils'

declare global {
  interface Window {
    JibuNativeFile?: {
      savePdf: (filename: string, base64: string) => Promise<{ saved: boolean }>
    }
    ReactNativeWebView?: {
      postMessage: (message: string) => void
    }
  }
}

export async function downloadReceiptPreviewPdf(receipt: ReceiptPreview, fallbackReference: string): Promise<'native-saved' | 'browser-download'> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const left = 18
  const right = pageWidth - left
  let y = 20
  const ensureSpace = (height: number) => {
    if (y + height > pageHeight - 18) {
      pdf.addPage()
      y = 20
    }
  }
  const line = (label: string, value: string, bold = false) => {
    const valueLines = pdf.splitTextToSize(value, 92)
    ensureSpace(Math.max(8, valueLines.length * 5 + 4))
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.text(label, left, y)
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.text(valueLines, right, y, { align: 'right' })
    y += Math.max(7, valueLines.length * 5 + 2)
  }

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(17)
  pdf.text(receipt.business.name || 'Business', pageWidth / 2, y, { align: 'center' })
  y += 7
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  for (const contact of [receipt.business.address, receipt.business.phone, receipt.business.email].filter(Boolean)) {
    const rows = pdf.splitTextToSize(String(contact), pageWidth - 36)
    pdf.text(rows, pageWidth / 2, y, { align: 'center' })
    y += rows.length * 4 + 1
  }
  y += 5
  pdf.setDrawColor(80)
  pdf.line(left, y, right, y)
  y += 8
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(13)
  pdf.text(receipt.documentTitle || 'Receipt', pageWidth / 2, y, { align: 'center' })
  y += 7
  pdf.setFontSize(10)
  pdf.text(receipt.receiptNo || fallbackReference, pageWidth / 2, y, { align: 'center' })
  y += 8

  if (receipt.customerName) line('Customer', receipt.customerName)
  line('Date', formatDisplayDate(receipt.createdAt, { hour: '2-digit', minute: '2-digit' }))
  if (receipt.cashier && receipt.cashier !== '-') line(receipt.cashierLabel || 'Cashier', receipt.cashier)
  if (receipt.paymentMethod) line('Payment method', receipt.paymentMethod)

  if (receipt.items?.length) {
    y += 3
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.text('Item', left, y)
    pdf.text('Qty', right - 76, y, { align: 'right' })
    pdf.text('Unit price', right - 42, y, { align: 'right' })
    pdf.text('Total', right, y, { align: 'right' })
    y += 3
    pdf.line(left, y, right, y)
    y += 6
    for (const item of receipt.items) {
      const name = pdf.splitTextToSize(item.name, 72)
      ensureSpace(Math.max(7, name.length * 5 + 2))
      pdf.setFont('helvetica', 'normal')
      pdf.text(name, left, y)
      pdf.text(String(item.quantity), right - 76, y, { align: 'right' })
      pdf.text(formatCurrency(item.price, receipt.transactionCurrency), right - 42, y, { align: 'right' })
      pdf.text(formatCurrency(item.total, receipt.transactionCurrency), right, y, { align: 'right' })
      y += Math.max(7, name.length * 5 + 2)
    }
  }

  y += 3
  pdf.setDrawColor(180)
  pdf.line(left, y, right, y)
  y += 8
  const totalCurrency = receipt.transactionCurrency || receipt.baseCurrency || receipt.business.currency || 'UGX'
  const displayedTotal = totalCurrency !== (receipt.baseCurrency || receipt.business.currency || 'UGX')
    ? Number(receipt.foreignTotal ?? receipt.total)
    : Number(receipt.total)
  line(receipt.amountLabel || 'Amount', formatCurrency(displayedTotal, totalCurrency), true)
  for (const detail of receipt.additionalDetails || []) line(detail.label, detail.value)
  const footer = receipt.business.receiptFooter?.trim() || 'Thank you for your purchase!'
  const footerLines = pdf.splitTextToSize(footer, pageWidth - 36)
  ensureSpace(footerLines.length * 4 + 12)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.text(footerLines, pageWidth / 2, y, { align: 'center' })
  y += footerLines.length * 4 + 4
  ensureSpace(10)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.text('Powered by JibuSales', pageWidth / 2, y, { align: 'center' })

  const safeReference = (receipt.receiptNo || fallbackReference).replace(/[^a-z0-9-_]/gi, '-') || 'receipt'
  const filename = `${safeReference}.pdf`
  if (typeof window !== 'undefined' && window.JibuNativeFile?.savePdf) {
    const dataUrl = pdf.output('datauristring')
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    const result = await window.JibuNativeFile.savePdf(filename, base64)
    if (!result?.saved) throw new Error('The receipt was not saved. Please choose a folder and try again.')
    return 'native-saved'
  }
  if (typeof window !== 'undefined' && window.ReactNativeWebView) {
    throw new Error('Receipt download is unavailable in this app version. Update JibuSales and try again.')
  }

  const blob = pdf.output('blob')
  const downloadUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = downloadUrl
  link.download = filename
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000)
  return 'browser-download'
}
