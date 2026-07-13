import { useEffect, useRef, useState, useCallback } from 'react'
import { Camera, ScanBarcode, X, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onClose?: () => void
  onFail?: () => void
  placeholder?: string
}

const SCAN_TIMEOUT_MS = 30000

const isDeviceMobile = () => {
  if (typeof window === 'undefined' || typeof window.navigator === 'undefined') return false
  const ua = window.navigator.userAgent
  const isMobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
  const isTouch = 'maxTouchPoints' in navigator ? navigator.maxTouchPoints > 0 : 'ontouchstart' in window
  const isSmallScreen = window.matchMedia('(max-width: 768px)').matches
  return isMobileUa || isTouch || isSmallScreen
}

/**
 * Unified barcode scanner — auto-detects the best method:
 * - Keyboard input always active (catches USB/Bluetooth keyboard-wedge scanners)
 * - Camera auto-starts on mobile; on desktop, a "Start Camera" button is shown
 * - Scanning indicator with animated line
 * - 30s timeout with "Try Again" button
 */
export default function BarcodeScanner({ onScan, onClose, onFail, placeholder = 'Scan barcode or type SKU...' }: BarcodeScannerProps) {
  const [manualCode, setManualCode] = useState('')
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [timedOut, setTimedOut] = useState(false)
  const [scanning, setScanning] = useState(false)
  const scannerRef = useRef<any>(null)
  const [mobileDevice, setMobileDevice] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scannerBufferRef = useRef('')
  const lastScanKeyTimeRef = useRef<number | null>(null)

  // USB/Bluetooth keyboard-wedge scanners type fast and end with Enter
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && manualCode.trim()) {
      e.preventDefault()
      onScan(manualCode.trim())
      setManualCode('')
    }
  }, [manualCode, onScan])

  const handleGlobalKeyDown = useCallback((e: KeyboardEvent) => {
    const now = Date.now()
    if (lastScanKeyTimeRef.current && now - lastScanKeyTimeRef.current > 100) {
      scannerBufferRef.current = ''
    }
    lastScanKeyTimeRef.current = now

    if (e.key === 'Enter') {
      const buffer = scannerBufferRef.current.trim()
      if (buffer) {
        e.preventDefault()
        onScan(buffer)
        scannerBufferRef.current = ''
      }
      return
    }
    if (e.key.length === 1) {
      scannerBufferRef.current += e.key
    }
  }, [onScan])

  const handleManualSubmit = () => {
    if (manualCode.trim()) {
      onScan(manualCode.trim())
      setManualCode('')
    }
  }

  const stopCamera = useCallback(async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop()
        scannerRef.current.clear()
        scannerRef.current = null
      }
    } catch {}
    setCameraActive(false)
    setScanning(false)
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const startCamera = useCallback(async (useEnvironment = mobileDevice) => {
    try {
      setCameraError('')
      setTimedOut(false)

      const { Html5Qrcode } = await import('html5-qrcode')

      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
      }

      const scanner = new Html5Qrcode('barcode-camera-view')
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: useEnvironment ? 'environment' : 'user' },
        { fps: 12, qrbox: { width: 280, height: 160 }, aspectRatio: 1.5 },
        (decodedText: string) => {
          onScan(decodedText.trim())
          stopCamera()
        },
        () => {}
      )

      setCameraActive(true)
      setScanning(true)

      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        setTimedOut(true)
        setScanning(false)
        stopCamera()
        onFail?.()
      }, SCAN_TIMEOUT_MS)
    } catch (err: any) {
      setCameraError(err.message || 'Camera access denied')
      setCameraActive(false)
      setScanning(false)
      onFail?.()
    }
  }, [mobileDevice, onScan, stopCamera])

  // Auto-focus input for USB scanner; auto-start camera on mobile and touch devices
  useEffect(() => {
    const deviceIsMobile = isDeviceMobile()
    setMobileDevice(deviceIsMobile)
    if (inputRef.current) inputRef.current.focus()

    const canUseCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
    if (canUseCamera && (deviceIsMobile || window.innerWidth < 768 || ('maxTouchPoints' in navigator && navigator.maxTouchPoints > 0))) {
      startCamera(deviceIsMobile)
    }

    window.addEventListener('keydown', handleGlobalKeyDown)

    return () => {
      void stopCamera()
      window.removeEventListener('keydown', handleGlobalKeyDown)
    }
  }, [startCamera, stopCamera, handleGlobalKeyDown])

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

          {/* Manual input — always available for keyboard/USB scanners and as a fallback for camera issues */}
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1"
          autoFocus={!cameraActive}
        />
        <Button onClick={handleManualSubmit} size="sm">
          Search
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        USB/Bluetooth scanners are supported automatically when this field is focused.
      </p>

      {/* Camera scanner — auto-starts on mobile, button on desktop */}
      <div className="space-y-2">
        <div className="relative w-full rounded-lg overflow-hidden border bg-black"
          style={{ minHeight: cameraActive || timedOut ? '280px' : '0' }}
        >
          <div id="barcode-camera-view" className="w-full" style={{ minHeight: '280px' }} />

          {/* Scanning indicator overlay */}
          {scanning && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-end">
              {/* Animated scan line */}
              <div className="absolute inset-x-4 top-0 bottom-0 overflow-hidden">
                <div className="w-full h-0.5 bg-red-500 animate-[scanLine_2s_ease-in-out_infinite] opacity-80 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
              </div>
              {/* Status badge */}
              <div className="mb-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-medium text-white">Scanning...</span>
              </div>
            </div>
          )}

          {/* Timeout overlay */}
          {timedOut && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-3">
              <p className="text-sm text-white font-medium">No barcode detected</p>
              <p className="text-xs text-slate-300">Make sure the barcode is clearly visible</p>
              <Button onClick={startCamera} variant="outline" size="sm" className="bg-white text-black hover:bg-slate-100">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          )}
        </div>

        {cameraError && (
          <p className="text-sm text-destructive">{cameraError}</p>
        )}

        {!cameraActive && !timedOut && (
          <Button onClick={startCamera} variant="outline" className="w-full" size="sm">
            <Camera className="h-4 w-4 mr-2" />
            Start Camera Scanner
          </Button>
        )}
        {cameraActive && !timedOut && (
          <Button onClick={stopCamera} variant="outline" className="w-full" size="sm">
            <Camera className="h-4 w-4 mr-2" />
            Stop Camera
          </Button>
        )}
      </div>

      {/* Inline animation keyframes */}
      <style>{`
        @keyframes scanLine {
          0% { transform: translateY(0); }
          50% { transform: translateY(260px); }
          100% { transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
