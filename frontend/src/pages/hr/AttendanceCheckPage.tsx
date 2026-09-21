import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'

interface CheckInState {
  checkedIn: boolean
  checkInTime?: string
}

interface EmployeeOption {
  id: string
  firstName: string
  lastName: string
  employeeNumber?: string
}

interface Geofence {
  address: string
  latitude: number
  longitude: number
  radiusMeters: number
}

function distanceMeters(from: { lat: number; lng: number }, to: { latitude: number; longitude: number }) {
  const radians = (value: number) => value * Math.PI / 180
  const a = Math.sin(radians(to.latitude - from.lat) / 2) ** 2 + Math.cos(radians(from.lat)) * Math.cos(radians(to.latitude)) * Math.sin(radians(to.longitude - from.lng) / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
export default function AttendanceCheckPage() {
  const { toast } = useToast()
  const [state, setState] = useState<CheckInState>({ checkedIn: false })
  const [loading, setLoading] = useState(false)
  const [geofence, setGeofence] = useState<Geofence | null>(null)
  const [locationError, setLocationError] = useState('')
  const [geoLocation, setGeoLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [employeeId, setEmployeeId] = useState('')

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError('Location services are not available on this device.')
    } else {
      navigator.geolocation.getCurrentPosition(
        (position) => { setGeoLocation({ lat: position.coords.latitude, lng: position.coords.longitude }); setLocationError('') },
        () => setLocationError('Allow device location to record attendance.'),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      )
    }

    const loadAttendanceSetup = async () => {
      try {
        const [employeesResponse, geofenceResponse] = await Promise.all([
          apiFetch('/api/hr/attendance/employee-options'),
          apiFetch('/api/hr/attendance/geofence'),
        ])
        if (!employeesResponse.ok) throw new Error('Failed to load employees')
        if (!geofenceResponse.ok) throw new Error('Failed to load the business attendance location')
        const employeesData = await employeesResponse.json()
        const geofenceData = await geofenceResponse.json()
        const rows = Array.isArray(employeesData.data) ? employeesData.data : []
        setEmployees(rows)
        if (rows.length > 0) setEmployeeId(rows[0].id)
        setGeofence(geofenceData.configured ? geofenceData.data : null)
      } catch (error) {
        toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' })
      }
    }

    loadAttendanceSetup()
  }, [toast])

  const selectedEmployeeName = employees
    .filter((employee) => employee.id === employeeId)
    .map((employee) => [employee.employeeNumber, employee.firstName, employee.lastName].filter(Boolean).join(' - '))[0]

  const currentDistance = geoLocation && geofence ? distanceMeters(geoLocation, geofence) : null
  const withinBusinessLocation = currentDistance !== null && geofence !== null && currentDistance <= geofence.radiusMeters
  const canRecordAttendance = Boolean(employeeId && geoLocation && withinBusinessLocation)

  const payload = () => {
    if (!employeeId) throw new Error('Select an employee first')
    if (!geofence) throw new Error('The business owner must save the business address and location in Business Settings first.')
    if (!geoLocation || !withinBusinessLocation) throw new Error('You must be within the business attendance radius to record attendance.')
    return {
      employeeId,
      location: geofence.address,
      coordinates: { latitude: geoLocation.lat, longitude: geoLocation.lng },
    }
  }

  const handleCheckIn = async () => {
    try {
      setLoading(true)
      const res = await apiFetch('/api/hr/attendance/checkin', {
        method: 'POST',
        body: JSON.stringify(payload()),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || 'Failed to check in')
      }
      setState({ checkedIn: true, checkInTime: new Date().toLocaleTimeString() })
      toast({ title: 'Checked in', description: selectedEmployeeName || 'Attendance recorded' })
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleCheckOut = async () => {
    try {
      setLoading(true)
      const res = await apiFetch('/api/hr/attendance/checkout', {
        method: 'POST',
        body: JSON.stringify(payload()),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || 'Failed to check out')
      }
      setState({ checkedIn: false })
      toast({ title: 'Checked out', description: selectedEmployeeName || 'Attendance updated' })
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Attendance Check-In/Out</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg bg-muted/40 p-6 text-center">
            <div className="mb-3">
              <Badge variant={state.checkedIn ? 'default' : 'secondary'}>
                {state.checkedIn ? 'Checked In' : 'Ready'}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">{selectedEmployeeName || 'Select an employee'}</div>
            {state.checkInTime && <div className="mt-2 text-2xl font-semibold text-primary">{state.checkInTime}</div>}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Employee</label>
            <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="w-full rounded border p-2">
              <option value="">Select employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {[employee.employeeNumber, employee.firstName, employee.lastName].filter(Boolean).join(' - ')}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Business Location</label>
            <input type="text" value={geofence?.address || ''} readOnly placeholder="Business address must be configured in Business Settings" className="w-full rounded border bg-muted p-2" />
            {!geofence && <div className="text-xs text-destructive">The business owner must save the business address and capture its location before attendance can be recorded.</div>}
            {locationError && <div className="text-xs text-destructive">{locationError}</div>}
            {geofence && geoLocation && <div className={withinBusinessLocation ? 'text-xs text-green-700' : 'text-xs text-destructive'}>{withinBusinessLocation ? `Within the business attendance area (${Math.round(currentDistance || 0)}m away).` : `${Math.round(currentDistance || 0)}m from the business. Move within ${geofence.radiusMeters}m to continue.`}</div>}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Button onClick={handleCheckIn} disabled={state.checkedIn || loading || !canRecordAttendance} className="h-12">
              {loading ? 'Processing...' : 'Check In'}
            </Button>
            <Button onClick={handleCheckOut} disabled={!state.checkedIn || loading || !canRecordAttendance} variant="destructive" className="h-12">
              {loading ? 'Processing...' : 'Check Out'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
