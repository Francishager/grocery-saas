import { useEffect, useRef, useState, useCallback } from 'react'
import { Camera, ScanBarcode, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onClose?: () => void
  placeholder?: string
}

const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)

/**
 * Unified barcode scanner — auto-detects the best method:
 * - Keyboard input always active (catches USB/Bluetooth keyboard-wedge scanners)
 * - Camera auto-starts on mobile; on desktop, a "Start Camera" button is shown
 * - No manual mode selection needed
 */
export default function BarcodeScanner({ onScan, onClose, placeholder = 'Scan barcode or type SKU...' }: BarcodeScannerProps) {
  const [manualCode, setManualCode] = useState('')
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const scannerRef = useRef<any>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // USB/Bluetooth keyboard-wedge scanners type fast and end with Enter
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && manualCode.trim()) {
      e.preventDefault()
      onScan(manualCode.trim())
      setManualCode('')
    }
  }, [manualCode, onScan])

  const handleManualSubmit = () => {
    if (manualCode.trim()) {
      onScan(manualCode.trim())
      setManualCode('')
    }
  }

  const startCamera = useCallback(async () => {
    try {
      setCameraError('')
      setCameraActive(true)

      const { Html5Qrcode } = await import('html5-qrcode')

      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
      }

      const scanner = new Html5Qrcode('barcode-camera-view')
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.5 },
        (decodedText: string) => {
          onScan(decodedText)
          stopCamera()
        },
        () => {}
      )
    } catch (err: any) {
      setCameraError(err.message || 'Camera access denied')
      setCameraActive(false)
    }
  }, [onScan])

  const stopCamera = useCallback(async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop()
        scannerRef.current.clear()
        scannerRef.current = null
      }
    } catch {}
    setCameraActive(false)
  }, [])

  // Auto-focus input for USB scanner; auto-start camera on mobile
  useEffect(() => {
    if (inputRef.current) inputRef.current.focus()
    if (isMobile) {
      startCamera()
    }
    return () => { stopCamera() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ScanBarcode className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Barcode Scanner</span>
        <span className="text-xs text-muted-foreground">— scan with any device</span>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose} className="ml-auto">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Keyboard input — always visible for USB/Bluetooth scanners & manual entry */}
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1"
          autoFocus
        />
        <Button onClick={handleManualSubmit} size="sm">
          Search
        </Button>
      </div>

      {/* Camera scanner — auto-starts on mobile, button on desktop */}
      <div className="space-y-2">
        <div
          id="barcode-camera-view"
          className="w-full rounded-lg overflow-hidden border bg-black"
          style={{ minHeight: cameraActive ? '250px' : '0' }}
        />
        {cameraError && (
          <p className="text-sm text-destructive">{cameraError}</p>
        )}
        {!cameraActive ? (
          <Button onClick={startCamera} variant="outline" className="w-full" size="sm">
            <Camera className="h-4 w-4 mr-2" />
            Start Camera Scanner
          </Button>
        ) : (
          <Button onClick={stopCamera} variant="outline" className="w-full" size="sm">
            <Camera className="h-4 w-4 mr-2" />
            Stop Camera
          </Button>
        )}
      </div>
    </div>
  )
}
