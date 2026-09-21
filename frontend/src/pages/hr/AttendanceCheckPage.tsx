import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { MapPin, RefreshCw } from 'lucide-react'

interface AttendanceStatus {
  checkInTime?: string | null
  checkOutTime?: string | null
}

interface EmployeeOption {
  id: string
  firstName: string
  lastName: string
  employeeNumber?: string
}

interface Geofence {
  address: string
  latitude: number | null
  longitude: number | null
  radiusMeters: number
}

interface DeviceLocation {
  latitude: number
  longitude: number
  accuracy: number
}

async function attendanceRequest(path: string, init?: RequestInit) {
  const response = await apiFetch(path, { cache: 'no-store', ...init })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message || body.error || 'Unable to load attendance. Please try again.')
  return body
}

function distanceMeters(from: DeviceLocation, to: Geofence) {
  const radians = (value: number) => value * Math.PI / 180
  const a = Math.sin(radians(to.latitude! - from.latitude) / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude!))
    * Math.sin(radians(to.longitude! - from.longitude) / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
}

export default function AttendanceCheckPage() {
  const { toast } = useToast()
  const [status, setStatus] = useState<AttendanceStatus | null>(null)
  const [statusEmployeeId, setStatusEmployeeId] = useState('')
  const [statusError, setStatusError] = useState('')
  const [loading, setLoading] = useState(false)
  const submitting = useRef(false)
  const [geofence, setGeofence] = useState<Geofence | null>(null)
  const [configured, setConfigured] = useState(false)
  const [setupLoading, setSetupLoading] = useState(true)
  const [setupError, setSetupError] = useState('')
  const [employeeError, setEmployeeError] = useState('')
  const [locationError, setLocationError] = useState('')
  const [locating, setLocating] = useState(false)
  const [geoLocation, setGeoLocation] = useState<DeviceLocation | null>(null)
  const locationWatch = useRef<number | null>(null)
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [canRecordAnyone, setCanRecordAnyone] = useState(false)
  const [refreshVersion, setRefreshVersion] = useState(0)

  const refreshDeviceLocation = useCallback(() => {
    if (locationWatch.current !== null) navigator.geolocation?.clearWatch(locationWatch.current)
    setGeoLocation(null)
    setLocationError('')
    if (!window.isSecureContext || !navigator.geolocation) {
      setLocationError('Device location is unavailable. Open the secure JibuSales site and enable device location.')
      setLocating(false)
      return
    }
    setLocating(true)
    locationWatch.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setGeoLocation({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy })
        setLocationError('')
        setLocating(false)
      },
      (error) => {
        setGeoLocation(null)
        setLocating(false)
        setLocationError(error.code === 1
          ? 'Location is blocked. Allow Location in this site\'s browser settings and in your device settings, then select Refresh Location.'
          : error.code === 3
            ? 'Location request timed out. Turn on device location, then select Refresh Location.'
            : 'Your device could not determine its location. Check device location settings, then select Refresh Location.')
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    )
  }, [])

  useEffect(() => {
    refreshDeviceLocation()
    const refresh = () => {
      if (document.visibilityState !== 'visible' || submitting.current) return
      setRefreshVersion((value) => value + 1)
      refreshDeviceLocation()
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      if (locationWatch.current !== null) navigator.geolocation?.clearWatch(locationWatch.current)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [refreshDeviceLocation])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setSetupLoading(true)
    setSetupError('')
    setEmployeeError('')
    const loadLocation = async () => {
      try {
        const body = await attendanceRequest('/api/hr/attendance/geofence', { signal: controller.signal })
        if (!active) return
        setGeofence(body.data)
        setConfigured(Boolean(body.configured))
      } catch (error) {
        if (!active) return
        setConfigured(false)
        setSetupError((error as Error).message)
      } finally {
        if (active) setSetupLoading(false)
      }
    }
    const loadEmployees = async () => {
      try {
        const body = await attendanceRequest('/api/hr/attendance/employee-options', { signal: controller.signal })
        if (!active) return
        const rows: EmployeeOption[] = Array.isArray(body.data) ? body.data : []
        setEmployees(rows)
        setCanRecordAnyone(Boolean(body.canRecordAnyone))
        setEmployeeId((current) => rows.some((row) => row.id === current)
          ? current
          : body.ownEmployeeId || rows[0]?.id || '')
        if (!rows.length) setEmployeeError('No active employee profile is available for your login. Contact your HR administrator.')
      } catch (error) {
        if (!active) return
        setEmployees([])
        setEmployeeId('')
        setEmployeeError((error as Error).message)
      }
    }
    void loadLocation()
    void loadEmployees()
    return () => { active = false; controller.abort() }
  }, [refreshVersion])

  useEffect(() => {
    setStatusEmployeeId('')
    setStatusError('')
    setStatus(null)
    if (!employeeId) return
    const controller = new AbortController()
    let active = true
    attendanceRequest('/api/hr/attendance/current-status?employeeId=' + encodeURIComponent(employeeId), { signal: controller.signal })
      .then((body) => {
        if (active) { setStatus(body.data); setStatusEmployeeId(employeeId) }
      })
      .catch((error) => { if (active) setStatusError(error.message) })
    return () => { active = false; controller.abort() }
  }, [employeeId, refreshVersion])

  const selectedEmployee = employees.find((employee) => employee.id === employeeId)
  const selectedEmployeeName = selectedEmployee
    ? [selectedEmployee.employeeNumber, selectedEmployee.firstName, selectedEmployee.lastName].filter(Boolean).join(' - ')
    : ''
  const currentDistance = geoLocation && configured && geofence ? distanceMeters(geoLocation, geofence) : null
  const withinBusinessLocation = currentDistance !== null && geofence !== null && currentDistance <= geofence.radiusMeters
  const statusReady = Boolean(employeeId && statusEmployeeId === employeeId && !statusError)
  const checkedIn = Boolean(status?.checkInTime && !status?.checkOutTime)
  const completed = Boolean(status?.checkOutTime)
  const canRecordAttendance = Boolean(statusReady && !setupLoading && !setupError && !employeeError && !locationError && withinBusinessLocation)
  const disabledReason = setupLoading ? 'Loading saved business location...'
    : setupError || employeeError || statusError || locationError
      || (!configured ? 'The business owner must capture the business GPS location in Business Profile and save changes.'
        : !employeeId ? 'Select an employee.'
          : !statusReady ? 'Loading employee attendance status...'
            : !geoLocation ? 'Waiting for your device location...'
              : !withinBusinessLocation ? 'You are outside the saved business attendance area.'
                : completed ? 'Attendance is completed for today.' : '')

  const recordAttendance = async (action: 'checkin' | 'checkout') => {
    if (submitting.current || !canRecordAttendance || !geofence || !geoLocation) return
    submitting.current = true
    setLoading(true)
    try {
      const body = await attendanceRequest('/api/hr/attendance/' + action, {
        method: 'POST',
        body: JSON.stringify({
          employeeId,
          location: geofence.address,
          coordinates: { latitude: geoLocation.latitude, longitude: geoLocation.longitude },
        }),
      })
      setStatus(body.data)
      setStatusEmployeeId(employeeId)
      toast({ title: action === 'checkin' ? 'Checked in' : 'Checked out', description: selectedEmployeeName })
    } catch (error) {
      toast({ title: 'Attendance could not be recorded', description: (error as Error).message, variant: 'destructive' })
      setRefreshVersion((value) => value + 1)
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Card>
        <CardHeader><CardTitle>Attendance Check-In/Out</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg bg-muted/40 p-6 text-center">
            <Badge variant={checkedIn ? 'default' : 'secondary'}>
              {!statusReady ? 'Awaiting employee status' : completed ? 'Checked Out' : checkedIn ? 'Checked In' : 'Ready'}
            </Badge>
            <div className="mt-3 break-words text-sm text-muted-foreground">{selectedEmployeeName || 'Select an employee'}</div>
            {status?.checkInTime && <div className="mt-2 text-lg font-semibold">Check in: {new Date(status.checkInTime).toLocaleTimeString()}</div>}
            {status?.checkOutTime && <div className="mt-2 text-lg font-semibold">Check out: {new Date(status.checkOutTime).toLocaleTimeString()}</div>}
          </div>

          <div className="space-y-2">
            <label htmlFor="attendance-employee" className="text-sm font-medium">Employee</label>
            <select id="attendance-employee" value={employeeId} disabled={loading || !canRecordAnyone}
              onChange={(event) => { setStatusEmployeeId(''); setEmployeeId(event.target.value) }}
              className="w-full min-w-0 rounded border p-2">
              <option value="">Select employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {[employee.employeeNumber, employee.firstName, employee.lastName].filter(Boolean).join(' - ')}
                </option>
              ))}
            </select>
            {employeeError && <p role="alert" className="text-sm text-destructive">{employeeError}</p>}
          </div>

          <div className="space-y-2">
            <label htmlFor="attendance-location" className="text-sm font-medium">Business Location</label>
            <div id="attendance-location" className="min-h-10 break-words rounded border bg-muted p-2 text-sm">
              {geofence?.address || (setupLoading ? 'Loading business address...' : 'Business address unavailable')}
            </div>
            <Button type="button" size="sm" variant="outline" disabled={loading}
              onClick={() => { setRefreshVersion((value) => value + 1); refreshDeviceLocation() }}>
              <RefreshCw className={'mr-2 h-3.5 w-3.5' + (locating ? ' animate-spin' : '')} />
              Refresh Location
            </Button>
            {geoLocation && configured && geofence && (
              <p className={withinBusinessLocation ? 'text-sm text-green-700' : 'text-sm text-destructive'}>
                <MapPin className="mr-1 inline h-4 w-4" />
                {Math.round(currentDistance || 0)}m from business; allowed radius {geofence.radiusMeters}m.
                {' '}Device accuracy: {Math.round(geoLocation.accuracy)}m.
              </p>
            )}
            {disabledReason && <p role="status" className="break-words text-sm text-muted-foreground">{disabledReason}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button onClick={() => recordAttendance('checkin')} disabled={checkedIn || completed || loading || !canRecordAttendance} className="h-12">
              {loading ? 'Processing...' : 'Check In'}
            </Button>
            <Button onClick={() => recordAttendance('checkout')} disabled={!checkedIn || loading || !canRecordAttendance} variant="destructive" className="h-12">
              {loading ? 'Processing...' : 'Check Out'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
