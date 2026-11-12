import CoreBluetooth
import ExpoModulesCore

public class JibuThermalPrinterModule: Module, CBCentralManagerDelegate, CBPeripheralDelegate {
  private let serviceIds = ["18F0", "FFE0", "FF00", "6E400001-B5A3-F393-E0A9-E50E24DCCA9E", "49535343-FE7D-4AE5-8FA9-9FAFD205E455"]
  private var central: CBCentralManager!
  private var peripherals: [String: CBPeripheral] = [:]
  private var scanPromise: Promise?
  private var printPromise: Promise?
  private var printBytes = Data()
  private var printOffset = 0
  private var activePeripheral: CBPeripheral?
  private var writableCharacteristic: CBCharacteristic?

  public func definition() -> ModuleDefinition {
    Name("JibuThermalPrinter")

    OnCreate {
      self.central = CBCentralManager(delegate: self, queue: .main)
    }

    AsyncFunction("listPrinters") { (promise: Promise) in
      guard self.central.state == .poweredOn else {
        promise.reject("BLUETOOTH_UNAVAILABLE", "Turn on Bluetooth and allow access to discover nearby printers.")
        return
      }
      self.peripherals.removeAll()
      self.scanPromise = promise
      self.central.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
      DispatchQueue.main.asyncAfter(deadline: .now() + 6) {
        self.central.stopScan()
        let rows = self.peripherals.values.map { peripheral in
          ["id": peripheral.identifier.uuidString, "name": peripheral.name ?? "BLE printer", "transport": "bluetooth", "details": "Bluetooth Low Energy"]
        }
        self.scanPromise?.resolve(rows)
        self.scanPromise = nil
      }
    }.runOnQueue(.main)

    AsyncFunction("print") { (transport: String, deviceId: String, commands: [String], promise: Promise) in
      guard transport == "bluetooth" else {
        promise.reject("UNSUPPORTED_TRANSPORT", "Direct USB printing is not supported by iOS. Use a compatible Bluetooth LE printer or system printing.")
        return
      }
      guard self.central.state == .poweredOn,
            let peripheral = self.peripherals[deviceId] ?? self.central.retrievePeripherals(withIdentifiers: [UUID(uuidString: deviceId) ?? UUID()]).first else {
        promise.reject("PRINTER_NOT_FOUND", "Printer is no longer available. Scan again and select it.")
        return
      }
      guard let data = Self.decode(commands) else {
        promise.reject("INVALID_PRINT_DATA", "Receipt print data is invalid.")
        return
      }
      self.printPromise = promise
      self.printBytes = data
      self.printOffset = 0
      self.activePeripheral = peripheral
      peripheral.delegate = self
      self.central.connect(peripheral, options: nil)
    }.runOnQueue(.main)
  }

  public func centralManagerDidUpdateState(_ central: CBCentralManager) {
    if central.state != .poweredOn {
      scanPromise?.reject("BLUETOOTH_UNAVAILABLE", "Bluetooth is off or unavailable.")
      scanPromise = nil
    }
  }

  public func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi: NSNumber) {
    let advertised = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? []
    let serviceSet = Set(serviceIds.map { CBUUID(string: $0) })
    if advertised.contains(where: { serviceSet.contains($0) }) || peripheral.name?.localizedCaseInsensitiveContains("printer") == true {
      peripherals[peripheral.identifier.uuidString] = peripheral
    }
  }

  public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    peripheral.discoverServices(serviceIds.map { CBUUID(string: $0) })
    DispatchQueue.main.asyncAfter(deadline: .now() + 8) {
      if self.printPromise != nil && self.writableCharacteristic == nil {
        self.failPrint("This BLE printer does not expose a supported writable receipt service.")
      }
    }
  }

  public func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    failPrint(error?.localizedDescription ?? "Could not connect to the Bluetooth printer.")
  }

  public func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    if printPromise != nil { failPrint(error?.localizedDescription ?? "Printer disconnected before the receipt finished printing.") }
  }

  public func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    guard error == nil else { failPrint(error!.localizedDescription); return }
    guard let services = peripheral.services, !services.isEmpty else {
      failPrint("This BLE printer does not expose a supported receipt service.")
      return
    }
    services.forEach { peripheral.discoverCharacteristics(nil, for: $0) }
  }

  public func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    guard error == nil else { failPrint(error!.localizedDescription); return }
    guard writableCharacteristic == nil,
          let characteristic = service.characteristics?.first(where: { $0.properties.contains(.write) || $0.properties.contains(.writeWithoutResponse) }) else { return }
    writableCharacteristic = characteristic
    if characteristic.properties.contains(.write) {
      writeNextChunk(peripheral, characteristic)
    } else {
      writeWithoutResponse(peripheral, characteristic)
    }
  }

  public func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
    guard error == nil else { failPrint(error!.localizedDescription); return }
    writeNextChunk(peripheral, characteristic)
  }

  public func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
    guard let characteristic = writableCharacteristic else { return }
    writeWithoutResponse(peripheral, characteristic)
  }

  private func writeNextChunk(_ peripheral: CBPeripheral, _ characteristic: CBCharacteristic) {
    guard printPromise != nil else { return }
    if printOffset >= printBytes.count {
      printPromise?.resolve(true)
      printPromise = nil
      peripheral.delegate = nil
      central.cancelPeripheralConnection(peripheral)
      writableCharacteristic = nil
      return
    }
    let maxLength = max(20, peripheral.maximumWriteValueLength(for: .withResponse))
    let end = min(printOffset + maxLength, printBytes.count)
    peripheral.writeValue(printBytes.subdata(in: printOffset..<end), for: characteristic, type: .withResponse)
    printOffset = end
  }

  private func writeWithoutResponse(_ peripheral: CBPeripheral, _ characteristic: CBCharacteristic) {
    guard printPromise != nil else { return }
    guard peripheral.canSendWriteWithoutResponse else { return }
    guard printOffset < printBytes.count else {
      printPromise?.resolve(true)
      printPromise = nil
      peripheral.delegate = nil
      central.cancelPeripheralConnection(peripheral)
      writableCharacteristic = nil
      return
    }
    let maxLength = max(20, peripheral.maximumWriteValueLength(for: .withoutResponse))
    let end = min(printOffset + maxLength, printBytes.count)
    peripheral.writeValue(printBytes.subdata(in: printOffset..<end), for: characteristic, type: .withoutResponse)
    printOffset = end
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) { self.writeWithoutResponse(peripheral, characteristic) }
  }

  private func failPrint(_ message: String) {
    printPromise?.reject("PRINTER_FAILED", message)
    printPromise = nil
    if let peripheral = activePeripheral { central.cancelPeripheralConnection(peripheral) }
    activePeripheral = nil
    writableCharacteristic = nil
  }

  private static func decode(_ commands: [String]) -> Data? {
    let clean = commands.joined().filter { $0.isHexDigit }
    guard clean.count % 2 == 0 else { return nil }
    var output = Data()
    var index = clean.startIndex
    while index < clean.endIndex {
      let next = clean.index(index, offsetBy: 2)
      guard let byte = UInt8(clean[index..<next], radix: 16) else { return nil }
      output.append(byte)
      index = next
    }
    return output
  }
}
