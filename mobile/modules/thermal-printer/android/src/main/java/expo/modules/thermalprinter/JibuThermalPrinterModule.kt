package expo.modules.thermalprinter

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Coroutine
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.UUID
import kotlin.coroutines.resume

class JibuThermalPrinterModule : Module() {
  private val usbPermissionAction = "expo.modules.thermalprinter.JIBUSALES_USB_PERMISSION"
  private val sppUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

  override fun definition() = ModuleDefinition {
    Name("JibuThermalPrinter")

    AsyncFunction("listPrinters") {
      val printers = mutableListOf<Map<String, String>>()
      val context = appContext.reactContext ?: throw Exception("Printer services are unavailable.")
      val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
      usbManager.deviceList.values.forEach { device ->
        if (hasWritableEndpoint(device)) {
          printers.add(mapOf(
            "id" to usbId(device),
            "name" to (device.productName ?: "USB thermal printer"),
            "transport" to "usb",
            "details" to "USB · ${device.vendorId.toString(16)}:${device.productId.toString(16)}"
          ))
        }
      }
      val canReadBluetooth = Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == android.content.pm.PackageManager.PERMISSION_GRANTED
      if (canReadBluetooth) bluetoothAdapter()?.bondedDevices?.forEach { device ->
          printers.add(mapOf(
            "id" to (device.address ?: ""),
            "name" to (device.name ?: "Bluetooth printer"),
            "transport" to "bluetooth",
            "details" to "Paired Bluetooth"
          ))
        }
      printers
    }

    AsyncFunction("print") Coroutine { transport: String, deviceId: String, commands: List<String> ->
      val bytes = commands.flatMap { decodeHex(it).toList() }.toByteArray()
      if (bytes.isEmpty()) throw Exception("There is no receipt data to print.")
      when (transport) {
        "bluetooth" -> printBluetooth(deviceId, bytes)
        "usb" -> printUsb(deviceId, bytes)
        else -> throw Exception("This printer connection is not supported on Android.")
      }
    }
  }

  @SuppressLint("MissingPermission")
  private fun bluetoothAdapter(): BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()

  @SuppressLint("MissingPermission")
  private suspend fun printBluetooth(address: String, bytes: ByteArray) {
    requireBluetoothPermission()
    val device = bluetoothAdapter()?.getRemoteDevice(address)
      ?: throw Exception("Bluetooth is unavailable on this device.")
    val socket = device.createRfcommSocketToServiceRecord(sppUuid)
    try {
      socket.connect()
      socket.outputStream.use { output ->
        bytes.asList().chunked(2048).forEach { chunk ->
          output.write(chunk.map { it.toByte() }.toByteArray())
          output.flush()
        }
      }
    } catch (error: Exception) {
      throw Exception("Could not print to ${device.name ?: "the paired printer"}: ${error.message ?: "connection failed"}")
    } finally {
      try { socket.close() } catch (_: Exception) { }
    }
  }

  private fun requireBluetoothPermission() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val context = appContext.reactContext ?: throw Exception("Bluetooth is unavailable.")
      if (ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
        throw Exception("Bluetooth permission is required. Allow Nearby devices access, then retry.")
      }
    }
  }

  private suspend fun printUsb(id: String, bytes: ByteArray) {
    val context = appContext.reactContext ?: throw Exception("USB printer services are unavailable.")
    val manager = context.getSystemService(Context.USB_SERVICE) as UsbManager
    val device = manager.deviceList.values.firstOrNull { usbId(it) == id }
      ?: throw Exception("The USB printer is disconnected. Reconnect it and try again.")
    if (!manager.hasPermission(device) && !requestUsbPermission(context, manager, device)) {
      throw Exception("USB printer permission was denied.")
    }
    val candidates = deviceCandidates(device)
    if (candidates.isEmpty()) throw Exception("This USB printer has no supported bulk-print interface.")
    val connection = manager.openDevice(device) ?: throw Exception("Android could not open the USB printer.")
    try {
      var selected: Pair<android.hardware.usb.UsbInterface, android.hardware.usb.UsbEndpoint>? = null
      for ((usbInterface, endpoint) in candidates) {
        if (connection.claimInterface(usbInterface, true)) {
          selected = usbInterface to endpoint
          break
        }
      }
      val (usbInterface, endpoint) = selected ?: throw Exception("The USB printer interface is busy or unavailable.")
      try {
        var offset = 0
        while (offset < bytes.size) {
          val length = minOf(16 * 1024, bytes.size - offset)
          val written = connection.bulkTransfer(endpoint, bytes, offset, length, 10_000)
          if (written <= 0) throw Exception("USB printer stopped accepting receipt data.")
          offset += written
        }
      } finally {
        connection.releaseInterface(usbInterface)
      }
    } finally {
      connection.close()
    }
  }

  private suspend fun requestUsbPermission(context: Context, manager: UsbManager, device: UsbDevice): Boolean =
    suspendCancellableCoroutine { continuation ->
      val filter = IntentFilter(usbPermissionAction)
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(receiveContext: Context?, intent: Intent?) {
          try { context.unregisterReceiver(this) } catch (_: Exception) { }
          if (continuation.isActive) continuation.resume(intent?.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false) == true)
        }
      }
      if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      else context.registerReceiver(receiver, filter)
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0
      val permissionIntent = PendingIntent.getBroadcast(context, device.deviceId, Intent(usbPermissionAction).setPackage(context.packageName), flags)
      continuation.invokeOnCancellation { try { context.unregisterReceiver(receiver) } catch (_: Exception) { } }
      manager.requestPermission(device, permissionIntent)
    }

  private fun hasWritableEndpoint(device: UsbDevice) = deviceCandidates(device).isNotEmpty()

  private fun deviceCandidates(device: UsbDevice): List<Pair<android.hardware.usb.UsbInterface, android.hardware.usb.UsbEndpoint>> {
    val result = mutableListOf<Pair<android.hardware.usb.UsbInterface, android.hardware.usb.UsbEndpoint>>()
    for (i in 0 until device.interfaceCount) {
      val usbInterface = device.getInterface(i)
      for (e in 0 until usbInterface.endpointCount) {
        val endpoint = usbInterface.getEndpoint(e)
        if (endpoint.direction == UsbConstants.USB_DIR_OUT && endpoint.type == UsbConstants.USB_ENDPOINT_XFER_BULK) {
          result.add(usbInterface to endpoint)
        }
      }
    }
    return result.sortedBy { if (it.first.interfaceClass == 7) 0 else 1 }
  }

  private fun usbId(device: UsbDevice) = "${device.vendorId}:${device.productId}:${device.deviceName}"

  private fun decodeHex(value: String): ByteArray {
    val clean = value.replace(Regex("[^0-9a-fA-F]"), "")
    if (clean.length % 2 != 0) throw Exception("Receipt print data is invalid.")
    return ByteArray(clean.length / 2) { index -> clean.substring(index * 2, index * 2 + 2).toInt(16).toByte() }
  }
}
