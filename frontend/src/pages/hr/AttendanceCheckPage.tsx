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

export default function AttendanceCheckPage() {
  const { toast } = useToast()
  const [state, setState] = useState<CheckInState>({ checkedIn: false })
  const [loading, setLoading] = useState(false)
  const [location, setLocation] = useState('')
  const [geoLocation, setGeoLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [employeeId, setEmployeeId] = useState('')

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        setGeoLocation({ lat: position.coords.latitude, lng: position.coords.longitude })
      })
    }

    const loadEmployees = async () => {
      try {
        const res = await apiFetch('/api/hr/employees?take=500')
        if (!res.ok) throw new Error('Failed to load employees')
        const data = await res.json()
        const rows = Array.isArray(data.data) ? data.data : []
        setEmployees(rows)
        if (rows.length > 0) setEmployeeId(rows[0].id)
      } catch (error) {
        toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' })
      }
    }

    loadEmployees()
  }, [toast])

  const selectedEmployeeName = employees
    .filter((employee) => employee.id === employeeId)
    .map((employee) => [employee.employeeNumber, employee.firstName, employee.lastName].filter(Boolean).join(' - '))[0]

  const payload = () => {
    if (!employeeId) throw new Error('Select an employee first')
    const data: any = { employeeId }
    if (location) data.location = location
    if (geoLocation) data.location = [location, `${geoLocation.lat.toFixed(6)},${geoLocation.lng.toFixed(6)}`].filter(Boolean).join(' | ')
    return data
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
            <label className="text-sm font-medium">Location</label>
            <input
              type="text"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Office, branch, site, or station"
              className="w-full rounded border p-2"
            />
            {geoLocation && (
              <div className="text-xs text-muted-foreground">
                GPS captured: {geoLocation.lat.toFixed(4)}, {geoLocation.lng.toFixed(4)}
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Button onClick={handleCheckIn} disabled={state.checkedIn || loading || !employeeId} className="h-12">
              {loading ? 'Processing...' : 'Check In'}
            </Button>
            <Button onClick={handleCheckOut} disabled={!state.checkedIn || loading || !employeeId} variant="destructive" className="h-12">
              {loading ? 'Processing...' : 'Check Out'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
