import { useState } from 'react'
import { Download, FileText, Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { receiptsApi } from '@/lib/api'
import { ThermalPrinter, isSerialSupported } from '@/lib/thermalPrinter'
import { useToast } from '@/hooks/use-toast'

interface ReceiptViewerProps {
  saleId: string
  receiptNo: string
  onClose?: () => void
}

export default function ReceiptViewer({ saleId, receiptNo, onClose }: ReceiptViewerProps) {
  const [printing, setPrinting] = useState(false)
  const [connectingPrinter, setConnectingPrinter] = useState(false)
  const { toast } = useToast()

  const handleDownloadPdf = () => {
    const url = receiptsApi.getPdf(saleId)
    window.open(url, '_blank')
  }

  const handleThermalPrint = async () => {
    if (!isSerialSupported()) {
      toast({
        variant: 'destructive',
        title: 'Not supported',
        description: 'Web Serial API requires Chrome or Edge desktop browser',
      })
      return
    }

    const printer = new ThermalPrinter()
    setConnectingPrinter(true)
    try {
      const connected = await printer.connectToKnownPort()
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
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownloadPdf}
        className="flex items-center gap-1"
      >
        <FileText className="h-4 w-4" />
        PDF
      </Button>

      {isSerialSupported() && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleThermalPrint}
          disabled={printing || connectingPrinter}
          className="flex items-center gap-1"
        >
          <Printer className="h-4 w-4" />
          {connectingPrinter ? 'Connect...' : printing ? 'Printing...' : 'Print'}
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
  )
}
