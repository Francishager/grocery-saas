import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

export interface LocationData {
  latitude: number
  longitude: number
  accuracy?: number
  altitude?: number | null
  altitudeAccuracy?: number | null
  heading?: number | null
  speed?: number | null
  timestamp: number
}

export interface Address {
  country?: string
  countryCode?: string
  region?: string
  city?: string
  locality?: string
  street?: string
  streetNumber?: string
  postalCode?: string
  formatted?: string
}

export interface UserLocationContextValue {
  /** Current location */
  location: LocationData | null
  /** Address from geocoding */
  address: Address | null
  /** Loading state */
  loading: boolean
  /** Error state */
  error: string | null
  /** Whether geolocation is supported */
  isSupported: boolean
  /** Whether tracking is active */
  isTracking: boolean
  /** Request location permission */
  requestPermission: () => Promise<boolean>
  /** Get current location */
  getCurrentLocation: () => Promise<LocationData>
  /** Start tracking location */
  startTracking: (options?: PositionOptions) => void
  /** Stop tracking location */
  stopTracking: () => void
  /** Clear location data */
  clearLocation: () => void
  /** Geocode coordinates to address */
  geocode: (lat: number, lng: number) => Promise<Address>
  /** Reverse geocode address to coordinates */
  reverseGeocode: (address: string) => Promise<LocationData | null>
}

const UserLocationContext = createContext<UserLocationContextValue | undefined>(undefined)

export interface UserLocationProviderProps {
  children: ReactNode
  /** Whether to request location on mount */
  requestOnMount?: boolean
  /** Geocoding API endpoint */
  geocodingEndpoint?: string
  /** Default position options */
  defaultOptions?: PositionOptions
  /** Callback when location changes */
  onLocationChange?: (location: LocationData) => void
  /** Callback on error */
  onError?: (error: string) => void
}

export const UserLocationProvider: React.FC<UserLocationProviderProps> = ({
  children,
  requestOnMount = false,
  geocodingEndpoint,
  defaultOptions = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 60000,
  },
  onLocationChange,
  onError,
}) => {
  const [location, setLocation] = useState<LocationData | null>(null)
  const [address, setAddress] = useState<Address | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isTracking, setIsTracking] = useState(false)
  const [watchId, setWatchId] = useState<number | null>(null)

  const isSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator

  const handleError = useCallback((err: GeolocationPositionError) => {
    let message: string
    switch (err.code) {
      case err.PERMISSION_DENIED:
        message = 'Location permission denied'
        break
      case err.POSITION_UNAVAILABLE:
        message = 'Location unavailable'
        break
      case err.TIMEOUT:
        message = 'Location request timed out'
        break
      default:
        message = 'Unknown location error'
    }
    setError(message)
    onError?.(message)
  }, [onError])

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setError('Geolocation is not supported')
      return false
    }

    try {
      const result = await navigator.permissions.query({ name: 'geolocation' })
      return result.state === 'granted' || result.state === 'prompt'
    } catch {
      // Fallback for browsers that don't support permissions API
      return true
    }
  }, [isSupported])

  const getCurrentLocation = useCallback(async (): Promise<LocationData> => {
    if (!isSupported) {
      throw new Error('Geolocation is not supported')
    }

    setLoading(true)
    setError(null)

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const locationData: LocationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            altitudeAccuracy: position.coords.altitudeAccuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
            timestamp: position.timestamp,
          }
          setLocation(locationData)
          setLoading(false)
          onLocationChange?.(locationData)
          resolve(locationData)
        },
        (err) => {
          handleError(err)
          setLoading(false)
          reject(err)
        },
        defaultOptions
      )
    })
  }, [isSupported, defaultOptions, handleError, onLocationChange])

  const startTracking = useCallback((options?: PositionOptions) => {
    if (!isSupported) return

    setLoading(true)
    setError(null)
    setIsTracking(true)

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const locationData: LocationData = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          altitudeAccuracy: position.coords.altitudeAccuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
          timestamp: position.timestamp,
        }
        setLocation(locationData)
        setLoading(false)
        onLocationChange?.(locationData)
      },
      handleError,
      { ...defaultOptions, ...options }
    )

    setWatchId(id)
  }, [isSupported, defaultOptions, handleError, onLocationChange])

  const stopTracking = useCallback(() => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
      setWatchId(null)
    }
    setIsTracking(false)
  }, [watchId])

  const clearLocation = useCallback(() => {
    setLocation(null)
    setAddress(null)
    setError(null)
  }, [])

  const geocode = useCallback(async (lat: number, lng: number): Promise<Address> => {
    if (!geocodingEndpoint) {
      throw new Error('Geocoding endpoint not configured')
    }

    try {
      const response = await fetch(`${geocodingEndpoint}/reverse?lat=${lat}&lng=${lng}`)
      if (!response.ok) throw new Error('Geocoding failed')
      const data = await response.json()
      setAddress(data)
      return data
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Geocoding failed')
    }
  }, [geocodingEndpoint])

  const reverseGeocode = useCallback(async (addressString: string): Promise<LocationData | null> => {
    if (!geocodingEndpoint) {
      throw new Error('Geocoding endpoint not configured')
    }

    try {
      const response = await fetch(`${geocodingEndpoint}/forward?address=${encodeURIComponent(addressString)}`)
      if (!response.ok) throw new Error('Reverse geocoding failed')
      const data = await response.json()
      return data
    } catch {
      return null
    }
  }, [geocodingEndpoint])

  // Request location on mount if enabled
  useEffect(() => {
    if (requestOnMount) {
      getCurrentLocation().catch(() => {
        // Error is already handled
      })
    }
  }, [requestOnMount])

  // Cleanup tracking on unmount
  useEffect(() => {
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId)
      }
    }
  }, [watchId])

  const value: UserLocationContextValue = {
    location,
    address,
    loading,
    error,
    isSupported,
    isTracking,
    requestPermission,
    getCurrentLocation,
    startTracking,
    stopTracking,
    clearLocation,
    geocode,
    reverseGeocode,
  }

  return (
    <UserLocationContext.Provider value={value}>
      {children}
    </UserLocationContext.Provider>
  )
}

export const useUserLocation = (): UserLocationContextValue => {
  const context = useContext(UserLocationContext)
  if (!context) {
    throw new Error('useUserLocation must be used within a UserLocationProvider')
  }
  return context
}

export default UserLocationContext
