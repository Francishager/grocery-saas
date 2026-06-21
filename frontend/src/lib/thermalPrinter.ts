/**
 * ESC/POS Thermal Printer Integration via Web Serial and Web Bluetooth APIs
 * 
 * Usage:
 *   const printer = new ThermalPrinter()
 *   await printer.connect()        // Opens browser serial port picker
 *   await printer.print(saleData)  // Sends ESC/POS commands
 *   await printer.disconnect()
 */

const BLUETOOTH_PRINTER_PROFILES = [
  {
    service: '000018f0-0000-1000-8000-00805f9b34fb',
    characteristics: ['00002af1-0000-1000-8000-00805f9b34fb'],
  },
  {
    service: '0000ffe0-0000-1000-8000-00805f9b34fb',
    characteristics: ['0000ffe1-0000-1000-8000-00805f9b34fb'],
  },
  {
    service: '0000ff00-0000-1000-8000-00805f9b34fb',
    characteristics: ['0000ff02-0000-1000-8000-00805f9b34fb', '0000ff01-0000-1000-8000-00805f9b34fb'],
  },
  {
    service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    characteristics: ['6e400002-b5a3-f393-e0a9-e50e24dcca9e'],
  },
  {
    service: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    characteristics: ['49535343-8841-43f4-a8d4-ecbe34729bb3'],
  },
]

export class ThermalPrinter {
  private port: any | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null

  async connect(): Promise<boolean> {
    const serial = getSerialApi()
    if (!serial) {
      throw new Error('Web Serial API not supported in this browser. Use Chrome or Edge.')
    }

    try {
      this.port = await serial.requestPort()
      await this.openPort()
      return true
    } catch (err: any) {
      this.port = null
      this.writer = null
      throw new Error(`Printer connection failed: ${err.message}`)
    }
  }

  async connectToKnownPort(): Promise<boolean> {
    const serial = getSerialApi()
    if (!serial?.getPorts) return false

    const ports = await serial.getPorts()
    if (!ports.length) return false

    try {
      this.port = ports[0]
      await this.openPort()
      return true
    } catch {
      this.port = null
      this.writer = null
      return false
    }
  }

  private async openPort() {
    if (!this.port) throw new Error('No printer port selected')

    if (!this.port.writable) {
      await this.port.open({ baudRate: 9600 })
    }

    if (!this.port.writable) {
      throw new Error('Printer port is not writable')
    }

    this.writer = this.port.writable.getWriter()
  }

  async disconnect() {
    try {
      if (this.writer) {
        this.writer.releaseLock()
        this.writer = null
      }
      if (this.port) {
        await this.port.close()
        this.port = null
      }
    } catch {}
  }

  get connected(): boolean {
    return !!this.writer
  }

  /**
   * Print a receipt using ESC/POS commands from the backend
   */
  async printFromCommands(hexCommands: string[]) {
    if (!this.writer) throw new Error('Printer not connected')

    for (const hex of hexCommands) {
      const bytes = hexToBytes(hex)
      await this.writer.write(bytes)
    }
  }

  /**
   * Print a receipt directly from sale data (no backend needed)
   */
  async printReceipt(data: ReceiptData) {
    if (!this.writer) throw new Error('Printer not connected')

    const cmds: number[] = []

    // Initialize
    cmds.push(0x1b, 0x40)

    // Center align
    cmds.push(0x1b, 0x61, 0x01)

    // Header - business name (double height + bold)
    cmds.push(0x1b, 0x21, 0x30) // Double height + width + bold
    cmds.push(...encode(data.businessName))
    cmds.push(0x0a)

    // Reset to normal
    cmds.push(0x1b, 0x21, 0x00)

    if (data.address) {
      cmds.push(...encode(data.address))
      cmds.push(0x0a)
    }
    if (data.phone) {
      cmds.push(...encode(`Tel: ${data.phone}`))
      cmds.push(0x0a)
    }
    cmds.push(0x0a)

    // Left align
    cmds.push(0x1b, 0x61, 0x00)

    // Receipt info
    cmds.push(...encode(`Receipt: ${data.receiptNo}`))
    cmds.push(0x0a)
    cmds.push(...encode(`Date: ${data.date}`))
    cmds.push(0x0a)
    cmds.push(...encode(`Cashier: ${data.cashier}`))
    cmds.push(0x0a)
    cmds.push(...encode(`Payment: ${data.paymentMethod.toUpperCase()}`))
    cmds.push(0x0a)
    cmds.push(0x0a)

    // Separator
    cmds.push(...encode('--------------------------------'))
    cmds.push(0x0a)

    // Items
    cmds.push(...encode('Item               Qty  Price  Total'))
    cmds.push(0x0a)

    for (const item of data.items) {
      const name = item.name.substring(0, 18).padEnd(18)
      const qty = String(item.qty).padStart(3)
      const price = formatNum(item.price).padStart(6)
      const total = formatNum(item.total).padStart(7)
      cmds.push(...encode(`${name}${qty}${price}${total}`))
      cmds.push(0x0a)
    }

    cmds.push(...encode('--------------------------------'))
    cmds.push(0x0a)

    // Totals
    cmds.push(...encode(`Subtotal:${formatNum(data.subtotal).padStart(27)}`))
    cmds.push(0x0a)
    if (data.discount > 0) {
      cmds.push(...encode(`Discount:${formatNum(data.discount).padStart(26)}`))
      cmds.push(0x0a)
    }
    if (data.tax > 0) {
      cmds.push(...encode(`Tax:${formatNum(data.tax).padStart(30)}`))
      cmds.push(0x0a)
    }

    // Total - bold + double height
    cmds.push(0x1b, 0x21, 0x30)
    cmds.push(...encode(`TOTAL:${formatNum(data.total).padStart(28)}`))
    cmds.push(0x0a)
    cmds.push(0x1b, 0x21, 0x00)

    cmds.push(0x0a)

    // Footer - center
    cmds.push(0x1b, 0x61, 0x01)
    cmds.push(...encode('Thank you for your purchase!'))
    cmds.push(0x0a)
    cmds.push(...encode('Powered by JibuSales'))
    cmds.push(0x0a)

    // Feed and cut
    cmds.push(0x0a, 0x0a, 0x0a, 0x0a)
    cmds.push(0x1d, 0x56, 0x00) // Full cut

    await this.writer.write(new Uint8Array(cmds))
  }
}

export class BluetoothThermalPrinter {
  private device: any | null = null
  private characteristic: any | null = null

  async connect(): Promise<boolean> {
    const bluetooth = getBluetoothApi()
    if (!bluetooth) {
      throw new Error('Web Bluetooth API not supported in this browser. Use Chrome or Edge.')
    }

    this.device = await bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLUETOOTH_PRINTER_PROFILES.map((profile) => profile.service),
    })
    await this.openDevice(this.device)
    return true
  }

  async connectToKnownDevice(): Promise<boolean> {
    const bluetooth = getBluetoothApi()
    if (!bluetooth?.getDevices) return false

    const devices = await bluetooth.getDevices()
    for (const device of devices) {
      try {
        this.device = device
        await this.openDevice(device)
        return true
      } catch {
        this.device = null
        this.characteristic = null
      }
    }

    return false
  }

  private async openDevice(device: any) {
    const server = await device?.gatt?.connect()
    if (!server) throw new Error('Bluetooth printer does not expose a GATT server')

    for (const profile of BLUETOOTH_PRINTER_PROFILES) {
      try {
        const service = await server.getPrimaryService(profile.service)
        for (const characteristicId of profile.characteristics) {
          try {
            const characteristic = await service.getCharacteristic(characteristicId)
            const props = characteristic.properties || {}
            if (props.write || props.writeWithoutResponse || characteristic.writeValue || characteristic.writeValueWithoutResponse) {
              this.characteristic = characteristic
              return
            }
          } catch {}
        }
      } catch {}
    }

    throw new Error('No writable Bluetooth receipt-printer service found')
  }

  async disconnect() {
    try {
      this.characteristic = null
      if (this.device?.gatt?.connected) {
        this.device.gatt.disconnect()
      }
      this.device = null
    } catch {}
  }

  get connected(): boolean {
    return !!this.characteristic
  }

  async printFromCommands(hexCommands: string[]) {
    if (!this.characteristic) throw new Error('Bluetooth printer not connected')

    for (const hex of hexCommands) {
      const bytes = hexToBytes(hex)
      for (const chunk of chunkBytes(bytes, 20)) {
        await writeBluetoothChunk(this.characteristic, chunk)
        await wait(15)
      }
    }
  }
}

function encode(text: string): number[] {
  return Array.from(new TextEncoder().encode(text))
}

function formatNum(n: number): string {
  return (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export interface ReceiptData {
  businessName: string
  address?: string
  phone?: string
  receiptNo: string
  date: string
  cashier: string
  paymentMethod: string
  items: Array<{ name: string; qty: number; price: number; total: number }>
  subtotal: number
  discount: number
  tax: number
  total: number
}

/**
 * Check if Web Serial API is available
 */
export function isSerialSupported(): boolean {
  return !!getSerialApi()
}

export function isBluetoothSupported(): boolean {
  return !!getBluetoothApi()
}

export function isThermalPrintingSupported(): boolean {
  return isSerialSupported() || isBluetoothSupported()
}

function getSerialApi(): any | null {
  if (typeof navigator === 'undefined') return null
  return (navigator as any).serial || null
}

function getBluetoothApi(): any | null {
  if (typeof navigator === 'undefined') return null
  return (navigator as any).bluetooth || null
}

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(
    hex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
  )
}

function chunkBytes(bytes: Uint8Array, size: number): Uint8Array[] {
  const chunks: Uint8Array[] = []
  for (let index = 0; index < bytes.length; index += size) {
    chunks.push(bytes.slice(index, index + size))
  }
  return chunks
}

async function writeBluetoothChunk(characteristic: any, chunk: Uint8Array) {
  if (characteristic.properties?.writeWithoutResponse && characteristic.writeValueWithoutResponse) {
    await characteristic.writeValueWithoutResponse(chunk)
    return
  }

  if (characteristic.writeValueWithResponse) {
    await characteristic.writeValueWithResponse(chunk)
    return
  }

  await characteristic.writeValue(chunk)
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
