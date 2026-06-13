import { useEffect, useRef, useState, useCallback } from 'react'
import { Camera, ScanBarcode, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onClose?: () => void
  placeholder?: string
}

/**
 * Barcode scanner component with two modes:
 * 1. USB Scanner (keyboard wedge) — just focuses the input, scanner types into it
 * 2. Camera Scanner — uses html5-qrcode library for camera-based scanning
 */
export default function BarcodeScanner({ onScan, onClose, placeholder = 'Scan barcode or type SKU...' }: BarcodeScannerProps) {
  const [mode, setMode] = useState<'keyboard' | 'camera'>('keyboard')
  const [manualCode, setManualCode] = useState('')
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const cameraRef = useRef<HTMLDivElement>(null)
  const scannerRef = useRef<any>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // USB barcode scanners act as keyboard input — they type fast and end with Enter
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

  // Camera scanner
  const startCamera = useCallback(async () => {
    try {
      setCameraError('')
      setCameraActive(true)

      // Dynamic import to avoid bundling when not needed
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
        () => {} // Ignore scan failures (no QR found in frame)
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

  useEffect(() => {
    // Auto-focus input for USB scanner
    if (mode === 'keyboard' && inputRef.current) {
      inputRef.current.focus()
    }
    return () => {
      stopCamera()
    }
  }, [mode, stopCamera])

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <Button
          variant={mode === 'keyboard' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setMode('keyboard'); stopCamera() }}
          className="flex items-center gap-1"
        >
          <ScanBarcode className="h-4 w-4" />
          USB Scanner
        </Button>
        <Button
          variant={mode === 'camera' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('camera')}
          className="flex items-center gap-1"
        >
          <Camera className="h-4 w-4" />
          Camera
        </Button>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose} className="ml-auto">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Keyboard/USB scanner input */}
      {mode === 'keyboard' && (
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
      )}

      {/* Camera scanner */}
      {mode === 'camera' && (
        <div className="space-y-2">
          <div
            id="barcode-camera-view"
            ref={cameraRef}
            className="w-full rounded-lg overflow-hidden border bg-black"
            style={{ minHeight: cameraActive ? '250px' : '0' }}
          />
          {cameraError && (
            <p className="text-sm text-destructive">{cameraError}</p>
          )}
          {!cameraActive ? (
            <Button onClick={startCamera} className="w-full" size="sm">
              <Camera className="h-4 w-4 mr-2" />
              Start Camera Scanner
            </Button>
          ) : (
            <Button onClick={stopCamera} variant="outline" className="w-full" size="sm">
              Stop Camera
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
