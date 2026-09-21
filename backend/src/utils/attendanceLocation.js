export function validCoordinates(coordinates) {
  return typeof coordinates?.latitude === 'number' && Number.isFinite(coordinates.latitude)
    && Math.abs(coordinates.latitude) <= 90
    && typeof coordinates?.longitude === 'number' && Number.isFinite(coordinates.longitude)
    && Math.abs(coordinates.longitude) <= 180;
}

export function businessAttendanceLocation(tenant) {
  const location = {
    address: tenant?.address?.trim() || '',
    latitude: tenant?.attendanceLatitude ?? null,
    longitude: tenant?.attendanceLongitude ?? null,
    radiusMeters: tenant?.attendanceRadiusMeters || 200,
  };
  return { ...location, configured: Boolean(location.address) && validCoordinates(location) };
}
