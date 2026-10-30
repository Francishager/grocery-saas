import { requireNativeModule } from 'expo-modules-core'

export type NativePrinter = {
  id: string
  name: string
  transport: 'usb' | 'bluetooth'
  details?: string
}

type JibuThermalPrinterModuleType = {
  listPrinters(): Promise<NativePrinter[]>
  print(transport: NativePrinter['transport'], deviceId: string, commands: string[]): Promise<void>
}

export default requireNativeModule<JibuThermalPrinterModuleType>('JibuThermalPrinter')
