import { useState } from 'react'
import { Download, FileText, Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { receiptsApi } from '@/lib/api'
import {
  BluetoothThermalPrinter,
  ThermalPrinter,
  isBluetoothSupported,
  isSerialSupported,
} from '@/lib/thermalPrinter'
import { useToast } from '@/hooks/use-toast'

interface ReceiptViewerProps {
  saleId: string
  receiptNo: string
  onClose?: () => void
}

export default function ReceiptViewer({ saleId, receiptNo, onClose }: ReceiptViewerProps) {
  const [printing, setPrinting] = useState(false)
  const [connectingPrinter, setConnectingPrinter] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [printingMode, setPrintingMode] = useState<'serial' | 'bluetooth' | null>(null)
  const { toast } = useToast()
  const pdfUrl = receiptsApi.getPdf(saleId)

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
          View
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
            {printingMode === 'serial' && connectingPrinter ? 'Connect...' : printingMode === 'serial' && printing ? 'Printing...' : 'USB'}
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
            {printingMode === 'bluetooth' && connectingPrinter ? 'Connect...' : printingMode === 'bluetooth' && printing ? 'Printing...' : 'Bluetooth'}
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={handleDownloadPdf}
          className="flex items-center gap-1"
        >
          <Download className="h-4 w-4" />
        </Button>

        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3 sm:p-6">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-background shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">Receipt {receiptNo}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
                {isSerialSupported() && (
                  <Button variant="outline" size="sm" onClick={() => handleThermalPrint('serial')} disabled={printing || connectingPrinter}>
                    <Printer className="mr-2 h-4 w-4" />
                    USB
                  </Button>
                )}
                {isBluetoothSupported() && (
                  <Button variant="outline" size="sm" onClick={() => handleThermalPrint('bluetooth')} disabled={printing || connectingPrinter}>
                    <Printer className="mr-2 h-4 w-4" />
                    Bluetooth
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => setShowPreview(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <iframe
              title={`Receipt ${receiptNo}`}
              src={pdfUrl}
              className="h-[72vh] w-full border-0 bg-white"
            />
          </div>
        </div>
      )}
    </>
  )
}
