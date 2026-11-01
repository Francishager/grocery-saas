import { useEffect, useState } from 'react'
import { Download, FileText, Loader2, Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiFetch, receiptsApi, type ReceiptPreview } from '@/lib/api'
import {
  BluetoothThermalPrinter,
  buildEscPosReceiptCommands,
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
import { hasNativePrinterBridge, listNativePrinters, printWithNativePrinter, type NativePrinter } from '@/lib/nativePrinter'
import type { TransactionReceiptData } from '@/lib/transactionReceipt'
import { downloadReceiptPreviewPdf } from '@/lib/receiptPdf'

interface ReceiptViewerProps {
  saleId?: string
  receiptNo: string
  onClose?: () => void
  transactionData?: TransactionReceiptData
  triggerLabel?: string
  previewOnTrigger?: boolean
}

type DirectPrinter = BluetoothThermalPrinter | ThermalPrinter | UsbThermalPrinter
type PrinterChoice = 'usb' | 'serial' | 'bluetooth'

export default function ReceiptViewer({ saleId, receiptNo, onClose, transactionData, triggerLabel, previewOnTrigger = false }: ReceiptViewerProps) {
  const [printing, setPrinting] = useState(false)
  const [showPrinterPicker, setShowPrinterPicker] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [receipt, setReceipt] = useState<ReceiptPreview | null>(null)
  const [loadingReceipt, setLoadingReceipt] = useState(false)
  const [receiptError, setReceiptError] = useState<string | null>(null)
  const [agentBaseUrl, setAgentBaseUrl] = useState<string | null>(null)
  const [agentPrinters, setAgentPrinters] = useState<PrintAgentPrinter[]>([])
  const [nativePrinters, setNativePrinters] = useState<NativePrinter[]>([])
  const { toast } = useToast()
  const pdfUrl = saleId ? receiptsApi.getPdf(saleId) : ''
  const directPrintAvailable = isDirectThermalPrintingAvailable()
  const baseCurrency = receipt?.baseCurrency || receipt?.business.currency || 'UGX'
  const transactionCurrency = receipt?.transactionCurrency || baseCurrency
  const isForeignCurrencyReceipt = Boolean(receipt && transactionCurrency !== baseCurrency)

  useEffect(() => {
    if (!showPreview || receipt || loadingReceipt) return

    setLoadingReceipt(true)
    setReceiptError(null)
    loadReceiptForPrint()
      .then(setReceipt)
      .catch((error) => {
        setReceiptError(error?.message || 'Failed to load receipt')
      })
      .finally(() => setLoadingReceipt(false))
  }, [showPreview, receipt, loadingReceipt, saleId, transactionData])

  const handleDownloadPdf = async () => {
    if (transactionData) {
      try {
        await downloadReceiptPreviewPdf(await loadReceiptForPrint(), receiptNo)
      } catch (error: any) {
        toast({ variant: 'destructive', title: 'PDF download failed', description: error?.message || 'Could not create the receipt PDF.' })
      }
      return
    }

    if (!saleId) return
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
      const loadedReceipt = transactionData
        ? await loadTransactionReceipt(transactionData, receiptNo)
        : saleId ? await receiptsApi.get(saleId) : null
      if (!loadedReceipt) throw new Error('Receipt data is unavailable.')
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

  const getEscPosCommands = async () => {
    const receiptData = await loadReceiptForPrint()
    if (transactionData) return buildEscPosReceiptCommands(receiptData)
    if (!saleId) throw new Error('Receipt data is unavailable for this printer.')
    return (await receiptsApi.getEscPos(saleId)).commands
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

  const fallbackToBrowserPrint = () => {
    const opened = printReceiptInBrowser(loadReceiptForPrint, receiptNo)
    if (!opened) {
      toast({
        variant: 'destructive',
        title: 'Pop-up blocked',
        description: 'Enable pop-ups to print the receipt.',
      })
      return false
    }

    toast({
      title: 'Print dialog ready',
      description: 'A browser print window has been opened. Use it to finish printing the receipt.',
    })
    return true
  }

  const handlePrint = async () => {
    setPrinting(true)
    try {
      if (hasNativePrinterBridge()) {
        const printers = await listNativePrinters()
        setNativePrinters(printers)
        if (!printers.length) {
          toast({ title: 'No compatible printer found', description: 'Pair a Bluetooth printer or connect a supported USB printer, then try again.' })
          return
        }
        setShowPrinterPicker(true)
        return
      }
      fallbackToBrowserPrint()
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Print failed',
        description: error?.message || 'Unable to open the browser receipt.',
      })
    } finally {
      setPrinting(false)
    }
  }

  const handleNativePrinterChoice = async (printer: NativePrinter) => {
    setShowPrinterPicker(false)
    setPrinting(true)
    try {
      const commands = await getEscPosCommands()
      await printWithNativePrinter(printer, commands)
      toast({ title: 'Receipt sent to printer', description: printer.name })
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Print failed', description: error?.message || 'The printer could not print this receipt.' })
    } finally {
      setPrinting(false)
    }
  }

  const handleAgentPrinterChoice = async (printer: PrintAgentPrinter) => {
    setShowPrinterPicker(false)
    setPrinting(true)

    try {
      await printWithAgent(printer.id, agentBaseUrl || undefined)
    } catch (error: any) {
      if (shouldFallbackToBrowserPrint(error)) {
        fallbackToBrowserPrint()
        return
      }

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
      if (!printer) {
        fallbackToBrowserPrint()
        return
      }
      await printWithPrinter(printer)
    } catch (error: any) {
      if (shouldFallbackToBrowserPrint(error)) {
        fallbackToBrowserPrint()
        return
      }

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
    const commands = await getEscPosCommands()
    await printer.printFromCommands(commands)
    toast({ title: 'Receipt printed successfully' })
  }

  const printWithAgent = async (printerId?: string, baseUrl?: string) => {
    const receiptData = await loadReceiptForPrint()
    const commands = await getEscPosCommands()

    if (!receipt && receiptData) setReceipt(receiptData)

    const result = await printReceiptViaAgent({
      baseUrl,
      printerId,
      saleId: saleId || `transaction-${receiptNo}`,
      receiptNo,
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
          onClick={previewOnTrigger ? () => setShowPreview(true) : handlePrint}
          disabled={!previewOnTrigger && printing}
          className="flex items-center gap-1"
        >
          {previewOnTrigger ? <FileText className="h-4 w-4" /> : <Printer className="h-4 w-4" />}
          {previewOnTrigger ? (triggerLabel || 'Receipt') : (printing ? 'Printing...' : (triggerLabel || 'Print'))}
        </Button>

        {!previewOnTrigger && <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowPreview(true)}
          className="flex items-center gap-1"
        >
          <FileText className="h-4 w-4" />
          Receipt
        </Button>}

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
              {nativePrinters.map((printer) => (
                <Button
                  key={`${printer.transport}-${printer.id}`}
                  variant="outline"
                  className="justify-start"
                  onClick={() => void handleNativePrinterChoice(printer)}
                  disabled={printing}
                >
                  <Printer className="mr-2 h-4 w-4" />
                  <span className="min-w-0 truncate">{printer.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{printer.details || printer.transport}</span>
                </Button>
              ))}
              {nativePrinters.length > 0 && <div className="my-1 border-t" />}
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
                <div className="mx-auto w-full max-w-[340px] rounded-sm bg-white p-5 font-mono text-[14px] font-semibold leading-6 text-zinc-950 shadow-xl ring-1 ring-zinc-300">
                  <div className="text-center text-zinc-950">
                    {receipt.business.logo && (
                      <img src={receipt.business.logo} alt="Logo" className="mx-auto mb-2 h-16 w-16 rounded object-contain" />
                    )}
                    <h2 className="font-sans text-xl font-extrabold">{receipt.business.name}</h2>
                    {receipt.business.address && <p>{receipt.business.address}</p>}
                    {receipt.business.phone && <p>Tel: {receipt.business.phone}</p>}
                    {receipt.business.email && <p>{receipt.business.email}</p>}
                    {receipt.branch?.name && <p>Branch: {receipt.branch.name}</p>}
                  </div>

                  <div className="my-3 border-t border-dashed border-zinc-900" />
                  {receipt.documentTitle && <p className="mb-2 text-center text-xs font-bold uppercase">{receipt.documentTitle}</p>}

                  <div className="space-y-1 text-zinc-950">
                    <div className="flex justify-between gap-3">
                      <span>Receipt</span>
                      <span className="text-right font-bold">{receipt.receiptNo}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Date</span>
                      <span className="text-right font-bold">{new Date(receipt.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>{receipt.cashierLabel || 'Cashier'}</span>
                      <span className="text-right font-bold">{receipt.cashier || '-'}</span>
                    </div>
                    {receipt.customerName && <div className="flex justify-between gap-3">
                      <span>{receipt.partyLabel || 'Customer'}</span>
                      <span className="text-right font-bold">{receipt.customerName}</span>
                    </div>}
                    {receipt.servedBy && <div className="flex justify-between gap-3">
                      <span>Served by</span>
                      <span className="text-right font-bold">{receipt.servedBy}</span>
                    </div>}
                    <div className="flex justify-between gap-3">
                      <span>Payment</span>
                      <span className="text-right font-bold uppercase">{receipt.paymentMethod}</span>
                    </div>
                  </div>

                  <div className="my-3 border-t border-dashed border-zinc-900" />

                  <div className="space-y-2">
                    {receipt.items.map((item) => (
                      <div key={item.id}>
                        <p className="break-words font-extrabold">{item.name}</p>
                        <div className="flex justify-between gap-3">
                          <span>{item.quantity} x {formatCurrency(item.price, baseCurrency)}</span>
                          <span className="font-bold">{formatCurrency(item.total, baseCurrency)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="my-3 border-t border-dashed border-zinc-900" />

                  <div className="space-y-1">
                    <div className="flex justify-between gap-3">
                      <span>Subtotal</span>
                      <span className="font-bold">{formatCurrency(receipt.subtotal, baseCurrency)}</span>
                    </div>
                    {receipt.discount > 0 && (
                      <div className="flex justify-between gap-3">
                        <span>Discount</span>
                        <span className="font-bold">{formatCurrency(receipt.discount, baseCurrency)}</span>
                      </div>
                    )}
                    {receipt.tax > 0 && (
                      <div className="flex justify-between gap-3">
                        <span>Tax</span>
                        <span className="font-bold">{formatCurrency(receipt.tax, baseCurrency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-3 border-t border-zinc-900 pt-2 text-lg font-extrabold">
                      <span>{receipt.amountLabel || (isForeignCurrencyReceipt ? `Base-currency total (${baseCurrency})` : 'Total')}</span>
                      <span>{formatCurrency(receipt.total, baseCurrency)}</span>
                    </div>
                    {isForeignCurrencyReceipt && <div className="flex justify-between gap-3 text-lg font-extrabold text-emerald-800">
                      <span>Transaction total ({transactionCurrency})</span>
                      <span>{formatCurrency(receipt.foreignTotal ?? receipt.total, transactionCurrency)}</span>
                    </div>}
                    {receipt.amountPaid != null && (
                      <>
                        <div className="flex justify-between gap-3 pt-1">
                          <span>Amount Paid</span>
                          <span className="font-bold">{formatCurrency(receipt.amountPaid, transactionCurrency)}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span>Change</span>
                          <span className="font-bold">{formatCurrency(receipt.changeGiven || 0, transactionCurrency)}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {receipt.additionalDetails?.length ? <div className="mt-2 space-y-1 border-t border-dashed border-zinc-900 pt-2">
                    {receipt.additionalDetails.map((detail, index) => <div key={`${detail.label}-${index}`} className="flex justify-between gap-3">
                      <span>{detail.label}</span><span className="max-w-[60%] text-right font-bold [overflow-wrap:anywhere]">{detail.value}</span>
                    </div>)}
                  </div> : null}

                  <div className="my-3 border-t border-dashed border-zinc-900" />

                  <div className="text-center">
                    {receipt.business.receiptHeader && <p className="mb-1">{receipt.business.receiptHeader}</p>}
                    <p>{receipt.business.receiptFooter?.trim() || 'Thank you for your purchase!'}</p>
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
                Browser Print / Save as PDF
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

async function loadTransactionReceipt(data: TransactionReceiptData, fallbackReceiptNo: string): Promise<ReceiptPreview> {
  let profile: any = {}
  try {
    const response = await apiFetch('/api/settings/business-profile')
    if (response.ok) profile = await response.json()
  } catch { /* Use a printable business-name fallback if settings are temporarily unavailable. */ }

  const fields = (data.fields || []).filter(field => field.value !== undefined && field.value !== null && field.value !== '')
  const fieldValue = (label: string) => fields.find(field => field.label.toLowerCase() === label.toLowerCase())?.value
  const receivedBy = fieldValue('Received by') ?? fieldValue('Cashier')
  const paymentMethod = fieldValue('Payment method')
  const currency = data.currency || profile.currency || 'UGX'
  const amount = Number(data.amount || 0)

  return {
    id: `transaction-${data.reference || fallbackReceiptNo}`,
    receiptNo: data.reference || fallbackReceiptNo,
    business: {
      name: profile.name || profile.businessName || 'Business',
      email: profile.email ?? null,
      phone: profile.phone ?? null,
      address: profile.address ?? null,
      logo: profile.logo ?? null,
      receiptHeader: profile.receiptHeader ?? profile.receipt_header ?? null,
      receiptFooter: profile.receiptFooter ?? profile.receipt_footer ?? null,
      currency: profile.currency || currency,
    },
    cashier: receivedBy ? String(receivedBy) : '-',
    cashierLabel: receivedBy ? 'Received by' : 'Cashier',
    partyLabel: data.partyLabel || 'Customer',
    customerName: data.partyName || null,
    paymentMethod: paymentMethod ? String(paymentMethod) : 'transaction',
    createdAt: new Date(data.date).toISOString(),
    baseCurrency: profile.currency || currency,
    transactionCurrency: currency,
    foreignTotal: amount,
    subtotal: amount,
    discount: 0,
    tax: 0,
    total: amount,
    documentTitle: data.title,
    amountLabel: data.amountLabel || 'Amount',
    additionalDetails: fields
      .filter(field => !['received by', 'cashier', 'payment method'].includes(field.label.toLowerCase()))
      .map(field => ({ label: field.label, value: String(field.value) })),
    items: (data.items || []).map((item, index) => ({
      id: `item-${index}`,
      name: item.name,
      quantity: Number(item.quantity || 0),
      price: Number(item.unitPrice || 0),
      total: Number(item.total || 0),
    })),
  }
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

function shouldFallbackToBrowserPrint(error: any): boolean {
  if (isSelectionCancel(error)) return false

  const message = String(error?.message || '').toLowerCase()
  return message.includes('permission')
    || message.includes('denied')
    || message.includes('notallowed')
    || message.includes('access denied')
    || message.includes('not supported')
    || message.includes('not writable')
    || message.includes('requestdevice')
    || message.includes('gatt')
    || message.includes('serial')
    || message.includes('bluetooth')
    || message.includes('usb')
    || message.includes('endpoint')
    || message.includes('failed to fetch')
    || message.includes('network')
    || message.includes('print agent')
}

function agentPrintErrorMessage(error: any) {
  const message = String(error?.message || '')
  if (message.toLowerCase().includes('failed to fetch') || message.toLowerCase().includes('network')) {
    return 'JibuSales Print Agent is not reachable. Open the Windows or Android Print Agent on this device and try again.'
  }
  return message || 'JibuSales Print Agent could not print this receipt.'
}
