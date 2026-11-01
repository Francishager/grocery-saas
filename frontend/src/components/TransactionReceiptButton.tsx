import { useEffect, useState } from 'react'
import { Download, Loader2, Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { printTransactionReceipt, type TransactionReceiptData } from '@/lib/transactionReceipt'
import { formatCurrency, formatDisplayDate } from '@/lib/utils'

interface ReceiptBusiness {
  name?: string
  address?: string | null
  phone?: string | null
  email?: string | null
  logo?: string | null
  currency?: string | null
}

export default function TransactionReceiptButton({ data, label = 'Print receipt' }: { data: TransactionReceiptData; label?: string }) {
  const [open, setOpen] = useState(false)
  const [business, setBusiness] = useState<ReceiptBusiness | null>(null)
  const [loadingBusiness, setLoadingBusiness] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const { toast } = useToast()
  const currency = data.currency || business?.currency || 'UGX'

  useEffect(() => {
    if (!open || business || loadingBusiness) return
    let active = true
    setLoadingBusiness(true)
    apiFetch('/api/settings/business-profile')
      .then(async response => {
        if (!response.ok) throw new Error('Business receipt details could not be loaded.')
        const profile = await response.json()
        if (active) setBusiness(profile)
      })
      .catch(() => {
        if (active) setBusiness({ name: 'Business' })
      })
      .finally(() => {
        if (active) setLoadingBusiness(false)
      })
    return () => { active = false }
  }, [open, business])

  const handlePrint = () => {
    if (!printTransactionReceipt({ ...data, business: business || undefined })) {
      toast({ title: 'Pop-up blocked', description: 'Allow pop-ups to open the browser print dialog.', variant: 'destructive' })
    }
  }

  const handleDownloadPdf = async () => {
    setDownloading(true)
    try {
      const { jsPDF } = await import('jspdf')
      const profile = business || await loadBusinessProfile()
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
      const line = (labelText: string, valueText: string, bold = false) => {
        const valueLines = pdf.splitTextToSize(valueText, 92)
        ensureSpace(Math.max(8, valueLines.length * 5 + 4))
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(10)
        pdf.text(labelText, left, y)
        pdf.setFont('helvetica', bold ? 'bold' : 'normal')
        pdf.text(valueLines, right, y, { align: 'right' })
        y += Math.max(7, valueLines.length * 5 + 2)
      }

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(17)
      pdf.text(profile.name || 'Business', pageWidth / 2, y, { align: 'center' })
      y += 7
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      for (const contact of [profile.address, profile.phone, profile.email].filter(Boolean)) {
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
      pdf.text(data.title, pageWidth / 2, y, { align: 'center' })
      y += 7
      pdf.setFontSize(10)
      pdf.text(data.reference, pageWidth / 2, y, { align: 'center' })
      y += 8

      if (data.partyName) line(data.partyLabel || 'Party', data.partyName)
      line('Date', formatDisplayDate(data.date, { hour: '2-digit', minute: '2-digit' }))

      if (data.items?.length) {
        y += 3
        pdf.setFont('helvetica', 'bold')
        pdf.text('Item', left, y)
        pdf.text('Qty', right - 76, y, { align: 'right' })
        pdf.text('Unit price', right - 42, y, { align: 'right' })
        pdf.text('Total', right, y, { align: 'right' })
        y += 3
        pdf.line(left, y, right, y)
        y += 6
        for (const item of data.items) {
          const itemName = `${item.name}${item.unitName ? ` (${item.unitName})` : ''}`
          const nameLines = pdf.splitTextToSize(itemName, 72)
          ensureSpace(Math.max(7, nameLines.length * 5 + 2))
          pdf.setFont('helvetica', 'normal')
          pdf.text(nameLines, left, y)
          pdf.text(String(item.quantity), right - 76, y, { align: 'right' })
          pdf.text(formatCurrency(item.unitPrice, currency), right - 42, y, { align: 'right' })
          pdf.text(formatCurrency(item.total, currency), right, y, { align: 'right' })
          y += Math.max(7, nameLines.length * 5 + 2)
        }
      }

      y += 3
      pdf.setDrawColor(180)
      pdf.line(left, y, right, y)
      y += 8
      line(data.amountLabel || 'Amount', formatCurrency(data.amount, currency), true)
      for (const field of (data.fields || []).filter(item => item.value !== undefined && item.value !== null && item.value !== '')) {
        line(field.label, String(field.value))
      }
      ensureSpace(12)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.text('Powered by JibuSales', pageWidth / 2, y + 5, { align: 'center' })

      const safeReference = data.reference.replace(/[^a-z0-9-_]/gi, '-') || 'receipt'
      pdf.save(`${safeReference}.pdf`)
    } catch (error) {
      toast({ title: 'PDF download failed', description: error instanceof Error ? error.message : 'Could not create the PDF.', variant: 'destructive' })
    } finally {
      setDownloading(false)
    }
  }

  const loadBusinessProfile = async (): Promise<ReceiptBusiness> => {
    try {
      const response = await apiFetch('/api/settings/business-profile')
      if (response.ok) {
        const profile = await response.json()
        setBusiness(profile)
        return profile
      }
    } catch { /* The receipt remains downloadable with a minimal business heading. */ }
    return { name: 'Business' }
  }

  const date = new Date(data.date)
  const dateLabel = Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
  const visibleFields = (data.fields || []).filter(field => field.value !== undefined && field.value !== null && field.value !== '')

  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
      <Printer className="mr-1 h-4 w-4" />{label}
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} className="z-[120] flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[calc(100dvh-2rem)]">
        <DialogHeader className="flex-row items-center justify-between gap-3 border-b px-4 py-3 pr-14 sm:px-5">
          <div className="min-w-0">
            <DialogTitle className="truncate">Receipt {data.reference}</DialogTitle>
            <DialogDescription>Review, print, or download this receipt.</DialogDescription>
          </div>
          <Button type="button" size="icon" variant="ghost" className="absolute right-3 top-3 shrink-0" onClick={() => setOpen(false)} aria-label="Close receipt">
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/40 p-3 sm:p-5">
          <article className="mx-auto w-full max-w-2xl rounded-md border bg-background p-4 shadow-sm sm:p-7">
            <header className="border-b pb-4 text-center">
              {business?.logo && <img src={business.logo} alt="Business logo" className="mx-auto mb-3 max-h-16 max-w-36 object-contain" />}
              <h2 className="text-xl font-bold">{loadingBusiness ? 'Loading business details…' : business?.name || 'Business'}</h2>
              {business?.address && <p className="mt-1 text-sm text-muted-foreground">{business.address}</p>}
              {[business?.phone, business?.email].filter(Boolean).map(contact => <p key={contact} className="text-sm text-muted-foreground">{contact}</p>)}
            </header>
            <div className="py-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{data.title}</p>
              <p className="mt-1 break-all font-semibold">{data.reference}</p>
            </div>
            {data.partyName && <ReceiptRow label={data.partyLabel || 'Party'} value={data.partyName} />}
            <ReceiptRow label="Date" value={dateLabel} />
            {data.items?.length ? <div className="my-4 overflow-x-auto rounded-md border">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-muted/60 text-left"><tr><th className="p-2">Item</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Unit price</th><th className="p-2 text-right">Discount</th><th className="p-2 text-right">Total</th></tr></thead>
                <tbody>{data.items.map((item, index) => <tr key={`${item.name}-${index}`} className="border-t"><td className="p-2">{item.name}{item.unitName ? ` (${item.unitName})` : ''}</td><td className="p-2 text-right">{item.quantity}</td><td className="p-2 text-right">{formatCurrency(item.unitPrice, currency)}</td><td className="p-2 text-right">{formatCurrency(item.discount || 0, currency)}</td><td className="p-2 text-right font-medium">{formatCurrency(item.total, currency)}</td></tr>)}</tbody>
              </table>
            </div> : null}
            <div className="my-4 border-t" />
            <ReceiptRow label={data.amountLabel || 'Amount'} value={formatCurrency(data.amount, currency)} emphasized />
            {visibleFields.map((field, index) => <ReceiptRow key={`${field.label}-${index}`} label={field.label} value={String(field.value)} />)}
            <p className="mt-6 border-t pt-3 text-center text-xs text-muted-foreground">Powered by JibuSales</p>
          </article>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t bg-background p-3 sm:flex-row sm:justify-end sm:px-5">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button>
          <Button type="button" variant="outline" onClick={() => void handleDownloadPdf()} disabled={downloading}>
            {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {downloading ? 'Preparing PDF…' : 'Download PDF'}
          </Button>
          <Button type="button" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />Print / Save as PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </>
}

function ReceiptRow({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return <div className={`flex items-start justify-between gap-4 border-b py-2 text-sm ${emphasized ? 'text-base font-bold' : ''}`}>
    <span className="shrink-0 text-muted-foreground">{label}</span>
    <span className="min-w-0 text-right font-medium [overflow-wrap:anywhere]">{value}</span>
  </div>
}
