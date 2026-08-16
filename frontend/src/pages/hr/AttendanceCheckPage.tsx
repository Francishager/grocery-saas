import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'

interface CheckInState {
  checkedIn: boolean
  checkInTime?: string
  duration?: string
}

export default function AttendanceCheckPage() {
  const { toast } = useToast()
  const [state, setState] = useState<CheckInState>({ checkedIn: false })
  const [loading, setLoading] = useState(false)
  const [location, setLocation] = useState<string>('')
  const [geoLocation, setGeoLocation] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    // Get current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        setGeoLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      })
    }
  }, [])

  const handleCheckIn = async () => {
    try {
      setLoading(true)
      const payload: any = {
        employeeId: localStorage.getItem('userId'),
        method: 'MANUAL',
      }

      if (location) payload.location = location
      if (geoLocation) {
        payload.latitude = geoLocation.lat
        payload.longitude = geoLocation.lng
      }

      const res = await apiFetch('/api/hr/attendance/checkin', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        const data = await res.json()
        setState({ checkedIn: true, checkInTime: new Date().toLocaleTimeString() })
        toast({ title: 'Success', description: 'Checked in successfully' })
      } else {
        toast({ title: 'Error', description: 'Failed to check in', variant: 'destructive' })
      }
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleCheckOut = async () => {
    try {
      setLoading(true)
      const payload: any = {
        employeeId: localStorage.getItem('userId'),
      }

      if (location) payload.location = location
      if (geoLocation) {
        payload.latitude = geoLocation.lat
        payload.longitude = geoLocation.lng
      }

      const res = await apiFetch('/api/hr/attendance/checkout', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        const data = await res.json()
        setState({ checkedIn: false })
        toast({ title: 'Success', description: 'Checked out successfully' })
      } else {
        toast({ title: 'Error', description: 'Failed to check out', variant: 'destructive' })
      }
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Attendance Check-In/Out</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Display */}
          <div className="p-6 bg-gray-50 rounded-lg text-center">
            <div className="mb-3">
              <Badge variant={state.checkedIn ? 'default' : 'secondary'}>
                {state.checkedIn ? 'Checked In' : 'Checked Out'}
              </Badge>
            </div>
            {state.checkInTime && (
              <div className="text-2xl font-bold text-blue-600 mb-2">
                {state.checkInTime}
              </div>
            )}
          </div>

          {/* Location Section */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Location (Optional)</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., Main Office, Branch 2"
              className="w-full border rounded p-2"
            />
            {geoLocation && (
              <div className="text-xs text-gray-500">
                GPS: {geoLocation.lat.toFixed(4)}, {geoLocation.lng.toFixed(4)}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button
              onClick={handleCheckIn}
              disabled={state.checkedIn || loading}
              className="h-12 text-lg"
              variant={state.checkedIn ? 'secondary' : 'default'}
            >
              {loading ? 'Processing...' : 'Check In'}
            </Button>
            <Button
              onClick={handleCheckOut}
              disabled={!state.checkedIn || loading}
              className="h-12 text-lg"
              variant={!state.checkedIn ? 'secondary' : 'destructive'}
            >
              {loading ? 'Processing...' : 'Check Out'}
            </Button>
          </div>

          {/* Method Variants */}
          <div className="pt-6 border-t space-y-3">
            <h3 className="font-medium">Quick Check-In Methods</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Button
                variant="outline"
                className="h-10"
                onClick={() => toast({ title: 'Info', description: 'QR code scanning not yet implemented' })}
              >
                📱 Scan QR Code
              </Button>
              <Button
                variant="outline"
                className="h-10"
                onClick={() => toast({ title: 'Info', description: 'Biometric scanning not yet implemented' })}
              >
                👆 Biometric
              </Button>
              <Button
                variant="outline"
                className="h-10"
                onClick={() => toast({ title: 'Info', description: 'Mobile app integration coming soon' })}
              >
                📲 Mobile App
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
