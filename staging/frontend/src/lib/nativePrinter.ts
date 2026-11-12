export type NativePrinter = {
  id: string
  name: string
  transport: 'usb' | 'bluetooth'
  details?: string
}

type NativePrinterBridge = {
  request<T = unknown>(payload: Record<string, unknown>): Promise<T>
}

declare global {
  interface Window {
    JibuNativePrinter?: NativePrinterBridge
  }
}

export function hasNativePrinterBridge() {
  return typeof window !== 'undefined' && typeof window.JibuNativePrinter?.request === 'function'
}

export async function listNativePrinters(): Promise<NativePrinter[]> {
  if (!hasNativePrinterBridge()) return []
  return window.JibuNativePrinter!.request<NativePrinter[]>({ type: 'printer.list' })
}

export async function printWithNativePrinter(printer: NativePrinter, commands: string[]) {
  if (!hasNativePrinterBridge()) throw new Error('Native printer access is unavailable in this browser.')
  await window.JibuNativePrinter!.request({
    type: 'printer.print',
    transport: printer.transport,
    deviceId: printer.id,
    commands,
  })
}
