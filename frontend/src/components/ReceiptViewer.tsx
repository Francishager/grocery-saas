import { useEffect, useState } from 'react'
import { Download, FileText, Loader2, Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { receiptsApi, type ReceiptPreview } from '@/lib/api'
import {
  BluetoothThermalPrinter,
  ThermalPrinter,
  isBluetoothSupported,
  isSerialSupported,
} from '@/lib/thermalPrinter'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/utils'

interface ReceiptViewerProps {
  saleId: string
  receiptNo: string
  onClose?: () => void
}

export default function ReceiptViewer({ saleId, receiptNo, onClose }: ReceiptViewerProps) {
  const [printing, setPrinting] = useState(false)
  const [connectingPrinter, setConnectingPrinter] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [receipt, setReceipt] = useState<ReceiptPreview | null>(null)
  const [loadingReceipt, setLoadingReceipt] = useState(false)
  const [receiptError, setReceiptError] = useState<string | null>(null)
  const [printingMode, setPrintingMode] = useState<'serial' | 'bluetooth' | null>(null)
  const { toast } = useToast()
  const pdfUrl = receiptsApi.getPdf(saleId)

  useEffect(() => {
    if (!showPreview || receipt || loadingReceipt) return

    setLoadingReceipt(true)
    setReceiptError(null)
    receiptsApi.get(saleId)
      .then(setReceipt)
      .catch((error) => {
        setReceiptError(error?.message || 'Failed to load receipt')
      })
      .finally(() => setLoadingReceipt(false))
  }, [showPreview, receipt, loadingReceipt, saleId])

  const handleDownloadPdf = () => {
    const link = document.createElement('a')
    link.href = pdfUrl
    link.download = `receipt-${receiptNo}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const handleThermalPrint = async (mode: 'serial' | 'bluetooth') => {
    if (mode === 'serial' && !isSerialSupported()) {
      toast({
        variant: 'destructive',
        title: 'Not supported',
        description: 'Web Serial API requires Chrome or Edge desktop browser',
      })
      return
    }

    if (mode === 'bluetooth' && !isBluetoothSupported()) {
      toast({
        variant: 'destructive',
        title: 'Not supported',
        description: 'Web Bluetooth API requires Chrome or Edge.',
      })
      return
    }

    const printer: BluetoothThermalPrinter | ThermalPrinter = mode === 'bluetooth' ? new BluetoothThermalPrinter() : new ThermalPrinter()
    setConnectingPrinter(true)
    setPrintingMode(mode)
    try {
      const connected = mode === 'bluetooth'
        ? await (printer as BluetoothThermalPrinter).connectToKnownDevice()
        : await (printer as ThermalPrinter).connectToKnownPort()
      if (!connected) await printer.connect()

      setPrinting(true)
      const { commands } = await receiptsApi.getEscPos(saleId)
      await printer.printFromCommands(commands)

      toast({ title: 'Receipt printed successfully' })
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Print failed',
        description: err?.message || 'Unable to print receipt',
      })
    } finally {
      await printer.disconnect()
      setPrinting(false)
      setConnectingPrinter(false)
      setPrintingMode(null)
    }
  }

  const printLabel = (mode: 'serial' | 'bluetooth', idleLabel: string) => {
    if (printingMode !== mode) return idleLabel
    if (connectingPrinter) return 'Connect...'
    if (printing) return 'Printing...'
    return idleLabel
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPreview(true)}
          className="flex items-center gap-1"
        >
          <FileText className="h-4 w-4" />
          Receipt
        </Button>

        {isSerialSupported() && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleThermalPrint('serial')}
            disabled={printing || connectingPrinter}
            className="flex items-center gap-1"
          >
            <Printer className="h-4 w-4" />
            {printLabel('serial', 'USB')}
          </Button>
        )}

        {isBluetoothSupported() && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleThermalPrint('bluetooth')}
            disabled={printing || connectingPrinter}
            className="flex items-center gap-1"
          >
            <Printer className="h-4 w-4" />
            {printLabel('bluetooth', 'Bluetooth')}
          </Button>
        )}

        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3 sm:p-6">
          <div className="flex max-h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-background shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <p className="min-w-0 truncate text-sm font-semibold">Receipt {receipt?.receiptNo || receiptNo}</p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={handleDownloadPdf} aria-label="Download receipt PDF">
                  <Download className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setShowPreview(false)} aria-label="Close receipt">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="overflow-y-auto bg-slate-100 p-4">
              {loadingReceipt && (
                <div className="flex h-64 items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {!loadingReceipt && receiptError && (
                <div className="rounded-md border bg-background p-4 text-sm text-destructive">
                  {receiptError}
                </div>
              )}

              {!loadingReceipt && receipt && (
                <div className="mx-auto w-full max-w-[340px] rounded-sm bg-white p-5 font-mono text-[13px] leading-relaxed text-slate-950 shadow">
                  <div className="text-center">
                    <h2 className="font-sans text-lg font-bold">{receipt.business.name}</h2>
                    {receipt.business.address && <p>{receipt.business.address}</p>}
                    {receipt.business.phone && <p>Tel: {receipt.business.phone}</p>}
                    {receipt.business.email && <p>{receipt.business.email}</p>}
                    {receipt.branch?.name && <p>Branch: {receipt.branch.name}</p>}
                  </div>

                  <div className="my-3 border-t border-dashed border-slate-400" />

                  <div className="space-y-1">
                    <div className="flex justify-between gap-3">
                      <span>Receipt</span>
                      <span className="text-right">{receipt.receiptNo}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Date</span>
                      <span className="text-right">{new Date(receipt.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Cashier</span>
                      <span className="text-right">{receipt.cashier || '-'}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Payment</span>
                      <span className="text-right uppercase">{receipt.paymentMethod}</span>
                    </div>
                  </div>

                  <div className="my-3 border-t border-dashed border-slate-400" />

                  <div className="space-y-2">
                    {receipt.items.map((item) => (
                      <div key={item.id}>
                        <p className="break-words font-semibold">{item.name}</p>
                        <div className="flex justify-between gap-3">
                          <span>{item.quantity} x {formatCurrency(item.price)}</span>
                          <span>{formatCurrency(item.total)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="my-3 border-t border-dashed border-slate-400" />

                  <div className="space-y-1">
                    <div className="flex justify-between gap-3">
                      <span>Subtotal</span>
                      <span>{formatCurrency(receipt.subtotal)}</span>
                    </div>
                    {receipt.discount > 0 && (
                      <div className="flex justify-between gap-3">
                        <span>Discount</span>
                        <span>{formatCurrency(receipt.discount)}</span>
                      </div>
                    )}
                    {receipt.tax > 0 && (
                      <div className="flex justify-between gap-3">
                        <span>Tax</span>
                        <span>{formatCurrency(receipt.tax)}</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-3 border-t border-slate-300 pt-2 text-base font-bold">
                      <span>Total</span>
                      <span>{formatCurrency(receipt.total)}</span>
                    </div>
                  </div>

                  <div className="my-3 border-t border-dashed border-slate-400" />

                  <div className="text-center">
                    <p>Thank you for your purchase!</p>
                    <p className="mt-1 text-[11px]">Powered by JibuSales</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3">
              {isSerialSupported() && (
                <Button variant="outline" size="sm" onClick={() => handleThermalPrint('serial')} disabled={printing || connectingPrinter}>
                  <Printer className="mr-2 h-4 w-4" />
                  {printLabel('serial', 'USB')}
                </Button>
              )}
              {isBluetoothSupported() && (
                <Button variant="outline" size="sm" onClick={() => handleThermalPrint('bluetooth')} disabled={printing || connectingPrinter}>
                  <Printer className="mr-2 h-4 w-4" />
                  {printLabel('bluetooth', 'Bluetooth')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
