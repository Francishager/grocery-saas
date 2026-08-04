import type { ReceiptPreview } from './api'

const AGENT_URL_STORAGE_KEY = 'jibusales_print_agent_url'
const AGENT_TOKEN_STORAGE_KEY = 'jibusales_print_agent_token'
const WORKSTATION_ID_STORAGE_KEY = 'jibusales_workstation_id'
const PRINTER_ID_STORAGE_KEY = 'jibusales_receipt_printer_id'

const DEFAULT_AGENT_URLS = [
  'http://127.0.0.1:17391',
  'http://localhost:17391',
  'http://127.0.0.1:9109',
  'http://localhost:9109',
  'http://127.0.0.1:9110',
  'http://localhost:9110',
]

const HEALTH_PATHS = ['/api/health', '/health', '/status', '/api/print-agent/health']
const PRINTER_PATHS = ['/api/printers', '/printers', '/api/print-agent/printers']
const PRINT_PATHS = ['/api/print-jobs', '/api/print', '/print', '/jobs']

export interface PrintAgentPrinter {
  id: string
  name: string
  connectionType?: string
  deviceIdentifier?: string
  paperWidth?: string
  isOnline?: boolean
  isDefault?: boolean
  status?: string
}

export interface PrintAgentConnection {
  baseUrl: string
  status?: unknown
  printers?: PrintAgentPrinter[]
}

export interface PrintReceiptViaAgentOptions {
  baseUrl?: string
  printerId?: string
  saleId: string
  receiptNo: string
  commands: string[]
  receipt?: ReceiptPreview | null
  copies?: number
}

export class PrintAgentUnavailableError extends Error {
  code = 'PRINT_AGENT_UNAVAILABLE'

  constructor(message = 'JibuSales Print Agent is not running on this device.') {
    super(message)
    this.name = 'PrintAgentUnavailableError'
  }
}

export function isPrintAgentUnavailableError(error: unknown): boolean {
  return error instanceof PrintAgentUnavailableError
    || String((error as any)?.code || '').toUpperCase() === 'PRINT_AGENT_UNAVAILABLE'
}

export async function discoverPrintAgent(): Promise<PrintAgentConnection | null> {
  if (typeof window === 'undefined') return null

  const probes = getAgentBaseUrls().map((baseUrl) => probePrintAgent(baseUrl))
  const results = await Promise.all(probes)
  const connection = results.find(Boolean) || null
  if (connection) rememberAgentUrl(connection.baseUrl)
  return connection
}

export async function getPrintAgentPrinters(baseUrl?: string): Promise<PrintAgentPrinter[]> {
  const connection = baseUrl ? { baseUrl } : await discoverPrintAgent()
  if (!connection) return []

  const printers = await fetchPrinters(connection.baseUrl)
  return printers
}

export function getStoredPrintAgentPrinterId(): string | null {
  return safeLocalStorageGet(PRINTER_ID_STORAGE_KEY)
}

export function rememberPrintAgentPrinter(printerId?: string | null) {
  if (!printerId || typeof window === 'undefined') return
  window.localStorage.setItem(PRINTER_ID_STORAGE_KEY, printerId)
}

export async function printReceiptViaAgent(options: PrintReceiptViaAgentOptions) {
  const baseUrl = options.baseUrl || (await discoverPrintAgent())?.baseUrl
  if (!baseUrl) throw new PrintAgentUnavailableError()

  const printerId = options.printerId || getStoredPrintAgentPrinterId() || undefined
  const workstationId = getWorkstationId()
  const copies = Math.max(1, options.copies || 1)
  const idempotencyKey = [
    'receipt',
    options.saleId,
    workstationId,
    printerId || 'default',
    copies,
  ].join(':')

  const body = {
    jobId: idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '-'),
    idempotencyKey,
    workstationId,
    printerId,
    documentType: 'RECEIPT',
    documentReference: options.receiptNo,
    copies,
    commands: options.commands,
    payloadFormat: 'ESC_POS_HEX',
    payload: {
      format: 'ESC_POS_HEX',
      commands: options.commands,
      saleId: options.saleId,
      receiptNo: options.receiptNo,
      receipt: options.receipt || null,
    },
    createdAt: new Date().toISOString(),
  }

  const errors: string[] = []
  for (const path of PRINT_PATHS) {
    const response = await fetchAgentJson(`${baseUrl}${path}`, {
      method: 'POST',
      timeoutMs: 10000,
      headers: {
        'Content-Type': 'application/json',
        'X-JibuSales-Workstation-Id': workstationId,
        'X-JibuSales-Document-Type': 'RECEIPT',
        ...agentAuthHeaders(),
      },
      body: JSON.stringify(body),
    }).catch((error) => ({ ok: false, status: 0, data: { error: error?.message || 'connection failed' } }))

    if (response.ok) {
      rememberAgentUrl(baseUrl)
      rememberPrintAgentPrinter(printerId)
      const data = response.data as any
      return {
        jobId: data?.jobId || data?.id || body.jobId,
        status: data?.status || data?.job?.status || 'QUEUED',
        queued: response.status === 202 || String(data?.status || '').toUpperCase() === 'QUEUED',
        message: data?.message,
      }
    }

    if (response.status === 404 || response.status === 405) {
      errors.push(`${path}: not supported`)
      continue
    }

    const message = extractErrorMessage(response.data) || `HTTP ${response.status}`
    throw new Error(`JibuSales Print Agent rejected the receipt: ${message}`)
  }

  throw new Error(`JibuSales Print Agent does not expose a supported print endpoint. ${errors.join('; ')}`)
}

async function probePrintAgent(baseUrl: string): Promise<PrintAgentConnection | null> {
  const healthChecks = HEALTH_PATHS.map((path) =>
    fetchAgentJson(`${baseUrl}${path}`, { timeoutMs: 750 })
      .then((response) => response.ok ? { baseUrl, status: response.data, printers: [] as PrintAgentPrinter[] } : null)
      .catch(() => null)
  )

  const printerChecks = PRINTER_PATHS.map((path) =>
    fetchAgentJson(`${baseUrl}${path}`, { timeoutMs: 900 })
      .then((response) => response.ok ? { baseUrl, printers: normalizePrinters(response.data) } : null)
      .catch(() => null)
  )

  const results = await Promise.all([...healthChecks, ...printerChecks])
  const printerResult = results.find((result) => result?.printers?.length)
  const healthResult = results.find(Boolean)
  return printerResult || healthResult || null
}

async function fetchPrinters(baseUrl: string): Promise<PrintAgentPrinter[]> {
  for (const path of PRINTER_PATHS) {
    const response = await fetchAgentJson(`${baseUrl}${path}`, { timeoutMs: 1500 }).catch(() => null)
    if (!response?.ok) continue

    const printers = normalizePrinters(response.data)
    rememberAgentUrl(baseUrl)
    return printers
  }
  return []
}

async function fetchAgentJson(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), options.timeoutMs || 1200)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: 'no-store',
      mode: 'cors',
      headers: {
        Accept: 'application/json',
        ...options.headers,
      },
    })

    const text = await response.text()
    const data = parseJson(text)
    return { ok: response.ok, status: response.status, data }
  } finally {
    window.clearTimeout(timer)
  }
}

function normalizePrinters(data: unknown): PrintAgentPrinter[] {
  const raw = Array.isArray(data)
    ? data
    : Array.isArray((data as any)?.printers)
      ? (data as any).printers
      : Array.isArray((data as any)?.data)
        ? (data as any).data
        : Array.isArray((data as any)?.devices)
          ? (data as any).devices
          : []

  return raw
    .map((printer: any, index: number) => {
      const id = String(printer.id || printer.printerId || printer.deviceIdentifier || printer.address || printer.path || printer.name || `printer-${index}`)
      return {
        id,
        name: String(printer.name || printer.displayName || printer.deviceName || printer.model || id),
        connectionType: printer.connectionType || printer.type || printer.kind,
        deviceIdentifier: printer.deviceIdentifier || printer.address || printer.path || printer.port || printer.serialPort,
        paperWidth: printer.paperWidth,
        isOnline: printer.isOnline ?? printer.online ?? String(printer.status || '').toUpperCase() === 'ONLINE',
        isDefault: printer.isDefault ?? printer.default ?? printer.role === 'RECEIPT',
        status: printer.status,
      }
    })
    .filter((printer) => printer.id && printer.name)
}

function getAgentBaseUrls(): string[] {
  const configured = String((import.meta.env.VITE_PRINT_AGENT_URL as string | undefined) || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  return unique([
    safeLocalStorageGet(AGENT_URL_STORAGE_KEY),
    ...configured,
    ...DEFAULT_AGENT_URLS,
  ].filter(Boolean) as string[]).map((url) => url.replace(/\/$/, ''))
}

function rememberAgentUrl(baseUrl: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(AGENT_URL_STORAGE_KEY, baseUrl.replace(/\/$/, ''))
}

function getWorkstationId(): string {
  const existing = safeLocalStorageGet(WORKSTATION_ID_STORAGE_KEY)
  if (existing) return existing

  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `station-${Date.now()}-${Math.random().toString(36).slice(2)}`

  if (typeof window !== 'undefined') window.localStorage.setItem(WORKSTATION_ID_STORAGE_KEY, id)
  return id
}

function agentAuthHeaders(): Record<string, string> {
  const token = safeLocalStorageGet(AGENT_TOKEN_STORAGE_KEY)
  return token ? { 'X-JibuSales-Agent-Token': token } : {}
}

function safeLocalStorageGet(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function unique(values: string[]) {
  return Array.from(new Set(values))
}

function parseJson(text: string) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function extractErrorMessage(data: unknown): string | null {
  if (!data) return null
  if (typeof data === 'string') return data
  return (data as any).error || (data as any).message || (data as any).detail || null
}
