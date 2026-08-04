import { useEffect, useState } from 'react'
import { Download, FileText, Loader2, Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { receiptsApi, type ReceiptPreview } from '@/lib/api'
import {
  BluetoothThermalPrinter,
  ThermalPrinter,
  UsbThermalPrinter,
  isBluetoothSupported,
  isDirectThermalPrintingAvailable,
  isSerialSupported,
  isUsbSupported,
} from '@/lib/thermalPrinter'
import { printReceiptInBrowser } from '@/lib/receiptPrint'
import {
  type PrintAgentPrinter,
  discoverPrintAgent,
  getPrintAgentPrinters,
  getStoredPrintAgentPrinterId,
  printReceiptViaAgent,
} from '@/lib/printAgent'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/utils'

interface ReceiptViewerProps {
  saleId: string
  receiptNo: string
  onClose?: () => void
}

type DirectPrinter = BluetoothThermalPrinter | ThermalPrinter | UsbThermalPrinter
type PrinterChoice = 'usb' | 'serial' | 'bluetooth'

export default function ReceiptViewer({ saleId, receiptNo, onClose }: ReceiptViewerProps) {
  const [printing, setPrinting] = useState(false)
  const [showPrinterPicker, setShowPrinterPicker] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [receipt, setReceipt] = useState<ReceiptPreview | null>(null)
  const [loadingReceipt, setLoadingReceipt] = useState(false)
  const [receiptError, setReceiptError] = useState<string | null>(null)
  const [agentBaseUrl, setAgentBaseUrl] = useState<string | null>(null)
  const [agentPrinters, setAgentPrinters] = useState<PrintAgentPrinter[]>([])
  const { toast } = useToast()
  const pdfUrl = receiptsApi.getPdf(saleId)
  const directPrintAvailable = isDirectThermalPrintingAvailable()

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

  const loadReceiptForPrint = async () => {
    if (receipt) return receipt

    setLoadingReceipt(true)
    setReceiptError(null)
    try {
      const loadedReceipt = await receiptsApi.get(saleId)
      setReceipt(loadedReceipt)
      return loadedReceipt
    } catch (error: any) {
      const message = error?.message || 'Failed to load receipt'
      setReceiptError(message)
      throw new Error(message)
    } finally {
      setLoadingReceipt(false)
    }
  }

  const connectRememberedPrinter = async (): Promise<DirectPrinter | null> => {
    const rememberedConnectors = [
      isUsbSupported() ? () => tryConnect(new UsbThermalPrinter(), (printer) => printer.connectToKnownDevice(), true) : null,
      isSerialSupported() ? () => tryConnect(new ThermalPrinter(), (printer) => printer.connectToKnownPort(), true) : null,
      isBluetoothSupported() ? () => tryConnect(new BluetoothThermalPrinter(), (printer) => printer.connectToKnownDevice(), true) : null,
    ].filter(Boolean) as Array<() => Promise<DirectPrinter | null>>

    for (const connect of rememberedConnectors) {
      const printer = await connect()
      if (printer) return printer
    }

    return null
  }

  const connectSelectedPrinter = async (choice: PrinterChoice): Promise<DirectPrinter | null> => {
    if (choice === 'usb') {
      if (!isUsbSupported()) throw new Error('USB printer access is not supported in this browser.')
      return tryConnect(new UsbThermalPrinter(), (printer) => printer.connect(), false)
    }

    if (choice === 'serial') {
      if (!isSerialSupported()) throw new Error('Serial/COM printer access is not supported in this browser.')
      return tryConnect(new ThermalPrinter(), (printer) => printer.connect(), false)
    }

    if (!isBluetoothSupported()) {
      throw new Error('Bluetooth printer access is not supported in this browser.')
    }

    return tryConnect(new BluetoothThermalPrinter(), (printer) => printer.connect(), false)
  }

  const tryPrintViaAgent = async (): Promise<boolean> => {
    const agent = await discoverPrintAgent()
    if (!agent) return false

    setAgentBaseUrl(agent.baseUrl)
    const printers = agent.printers?.length ? agent.printers : await getPrintAgentPrinters(agent.baseUrl)
    setAgentPrinters(printers)

    const storedPrinterId = getStoredPrintAgentPrinterId()
    const selectedPrinter = printers.find((printer) => printer.id === storedPrinterId)
      || printers.find((printer) => printer.isDefault && printer.isOnline !== false)
      || printers.find((printer) => printer.isOnline !== false)

    if (printers.length > 1 && !storedPrinterId) {
      setShowPrinterPicker(true)
      return true
    }

    await printWithAgent(selectedPrinter?.id, agent.baseUrl)
    return true
  }

  const tryConnect = async <T extends DirectPrinter>(
    printer: T,
    connect: (printer: T) => Promise<boolean>,
    suppressErrors: boolean,
  ): Promise<T | null> => {
    try {
      if (await connect(printer)) return printer
    } catch (error: any) {
      await printer.disconnect()
      if (suppressErrors || isSelectionCancel(error)) return null
      throw error
    }

    await printer.disconnect()
    return null
  }

  const handlePrint = async () => {
    setPrinting(true)
    let printer: DirectPrinter | null = null

    try {
      if (await tryPrintViaAgent()) return

      if (!directPrintAvailable) {
        toast({
          variant: 'destructive',
          title: 'Printer unavailable',
          description: 'Open the JibuSales Print Agent on this device, or use Chrome/Edge with a supported direct printer.',
        })
        return
      }

      printer = await connectRememberedPrinter()
      if (!printer) {
        setShowPrinterPicker(true)
        return
      }

      await printWithPrinter(printer)
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Print failed',
        description: printErrorMessage(error),
      })
    } finally {
      await printer?.disconnect()
      setPrinting(false)
    }
  }

  const handleAgentPrinterChoice = async (printer: PrintAgentPrinter) => {
    setShowPrinterPicker(false)
    setPrinting(true)

    try {
      await printWithAgent(printer.id, agentBaseUrl || undefined)
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Print failed',
        description: agentPrintErrorMessage(error),
      })
    } finally {
      setPrinting(false)
    }
  }

  const handlePrinterChoice = async (choice: PrinterChoice) => {
    setShowPrinterPicker(false)
    setPrinting(true)
    let printer: DirectPrinter | null = null

    try {
      printer = await connectSelectedPrinter(choice)
      if (!printer) return
      await printWithPrinter(printer)
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Print failed',
        description: directPrintErrorMessage(error),
      })
    } finally {
      await printer?.disconnect()
      setPrinting(false)
    }
  }

  const printWithPrinter = async (printer: DirectPrinter) => {
    const { commands } = await receiptsApi.getEscPos(saleId)
    await printer.printFromCommands(commands)
    toast({ title: 'Receipt printed successfully' })
  }

  const printWithAgent = async (printerId?: string, baseUrl?: string) => {
    const [{ commands, receiptNo: generatedReceiptNo }, receiptData] = await Promise.all([
      receiptsApi.getEscPos(saleId),
      receipt ? Promise.resolve(receipt) : receiptsApi.get(saleId).catch(() => null),
    ])

    if (receiptData && !receipt) setReceipt(receiptData)

    const result = await printReceiptViaAgent({
      baseUrl,
      printerId,
      saleId,
      receiptNo: generatedReceiptNo || receiptNo,
      commands,
      receipt: receiptData,
    })

    toast({
      title: result.queued ? 'Receipt sent to printer queue' : 'Receipt sent to printer',
    })
  }

  const handleSystemPrint = () => {
    const opened = printReceiptInBrowser(loadReceiptForPrint, receiptNo)
    if (!opened) {
      toast({
        variant: 'destructive',
        title: 'Pop-up blocked',
        description: 'Enable pop-ups to print the receipt.',
      })
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrint}
          disabled={printing}
          className="flex items-center gap-1"
        >
          <Printer className="h-4 w-4" />
          {printing ? 'Printing...' : 'Print'}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowPreview(true)}
          className="flex items-center gap-1"
        >
          <FileText className="h-4 w-4" />
          Receipt
        </Button>

        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {showPrinterPicker && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-lg bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="text-sm font-semibold">Select Printer</p>
              <Button variant="ghost" size="icon" onClick={() => setShowPrinterPicker(false)} aria-label="Close printer selection">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-2 p-4">
              {agentBaseUrl && (
                <div className="grid gap-2">
                  {agentPrinters.length > 0 ? (
                    agentPrinters.map((printer) => (
                      <Button
                        key={printer.id}
                        variant="outline"
                        className="justify-start"
                        onClick={() => handleAgentPrinterChoice(printer)}
                        disabled={printing || printer.isOnline === false}
                      >
                        <Printer className="mr-2 h-4 w-4" />
                        <span className="min-w-0 truncate">{printer.name}</span>
                        {printer.connectionType && (
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{printer.connectionType}</span>
                        )}
                      </Button>
                    ))
                  ) : (
                    <Button
                      variant="outline"
                      className="justify-start"
                      onClick={() => handleAgentPrinterChoice({ id: '', name: 'Default printer' })}
                      disabled={printing}
                    >
                      <Printer className="mr-2 h-4 w-4" />
                      Default Print Agent Printer
                    </Button>
                  )}
                  <div className="my-1 border-t" />
                </div>
              )}
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => handlePrinterChoice('usb')}
                disabled={!isUsbSupported() || printing}
              >
                <Printer className="mr-2 h-4 w-4" />
                USB Printer
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => handlePrinterChoice('bluetooth')}
                disabled={!isBluetoothSupported() || printing}
              >
                <Printer className="mr-2 h-4 w-4" />
                Bluetooth Printer
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => handlePrinterChoice('serial')}
                disabled={!isSerialSupported() || printing}
              >
                <Printer className="mr-2 h-4 w-4" />
                Serial/COM Printer
              </Button>
            </div>
          </div>
        </div>
      )}

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
                    {receipt.business.logo && (
                      <img src={receipt.business.logo} alt="Logo" className="mx-auto mb-2 h-16 w-16 rounded object-contain" />
                    )}
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
                    {receipt.amountPaid != null && (
                      <>
                        <div className="flex justify-between gap-3 pt-1">
                          <span>Amount Paid</span>
                          <span>{formatCurrency(receipt.amountPaid)}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span>Change</span>
                          <span>{formatCurrency(receipt.changeGiven || 0)}</span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="my-3 border-t border-dashed border-slate-400" />

                  <div className="text-center">
                    {receipt.business.receiptHeader && <p className="mb-1">{receipt.business.receiptHeader}</p>}
                    <p>Thank you for your purchase!</p>
                    {receipt.business.receiptFooter && <p className="mt-1">{receipt.business.receiptFooter}</p>}
                    <p className="mt-1 text-[11px]">Powered by JibuSales</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3">
              <Button variant="outline" size="sm" onClick={handlePrint} disabled={printing}>
                <Printer className="mr-2 h-4 w-4" />
                {printing ? 'Printing...' : 'Print'}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSystemPrint}>
                System Print
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function isSelectionCancel(error: any) {
  const message = String(error?.message || '').toLowerCase()
  const name = String(error?.name || '').toLowerCase()
  return name.includes('notfound')
    || name.includes('abort')
    || message.includes('no port selected')
    || message.includes('no device selected')
    || message.includes('user cancelled')
    || message.includes('user canceled')
    || message.includes('cancelled')
    || message.includes('canceled')
}

function directPrintErrorMessage(error: any) {
  const message = String(error?.message || '').toLowerCase()
  if (message.includes('permission') || message.includes('denied') || message.includes('notallowed')) {
    return 'Printer permission was denied. Pair the printer first, tap Print again, choose it, and allow access.'
  }
  if (message.includes('gatt') || message.includes('writable bluetooth') || message.includes('bluetooth')) {
    return 'This Bluetooth printer is not exposing a BLE receipt-printer service. On desktop, pair it as a COM/serial printer and choose it from the serial picker.'
  }
  if (message.includes('usb') || message.includes('endpoint') || message.includes('interface')) {
    return `USB printer direct printing failed: ${error?.message || 'the printer interface could not be opened'}. If the same printer exposes a serial/COM option, choose that when prompted.`
  }
  return error?.message || 'Unable to connect to the printer.'
}

function printErrorMessage(error: any) {
  const message = String(error?.message || '')
  if (message.toLowerCase().includes('jibusales print agent')) {
    return agentPrintErrorMessage(error)
  }
  return directPrintErrorMessage(error)
}

function agentPrintErrorMessage(error: any) {
  const message = String(error?.message || '')
  if (message.toLowerCase().includes('failed to fetch') || message.toLowerCase().includes('network')) {
    return 'JibuSales Print Agent is not reachable. Open the Windows or Android Print Agent on this device and try again.'
  }
  return message || 'JibuSales Print Agent could not print this receipt.'
}
