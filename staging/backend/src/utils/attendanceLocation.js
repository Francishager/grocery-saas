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

export function branchAttendanceLocation(tenant, branch = null) {
  const useBusinessLocation = !branch || branch.attendanceUseBusinessLocation !== false;
  const location = businessAttendanceLocation(useBusinessLocation ? tenant : branch);
  return {
    ...location,
    branchId: branch?.id || null,
    branchName: branch?.name || null,
    source: useBusinessLocation ? 'business' : 'branch',
    configured: location.configured && branch?.isActive !== false,
  };
}

export function branchAttendanceUpdates(body, existing = {}) {
  const data = {};
  const fail = (message) => { const error = new Error(message); error.status = 400; throw error; };
  if (Object.hasOwn(body, 'attendanceUseBusinessLocation')) {
    if (typeof body.attendanceUseBusinessLocation !== 'boolean') fail('Choose a valid attendance location source.');
    data.attendanceUseBusinessLocation = body.attendanceUseBusinessLocation;
  }
  const hasLatitude = Object.hasOwn(body, 'attendanceLatitude');
  const hasLongitude = Object.hasOwn(body, 'attendanceLongitude');
  if (hasLatitude || hasLongitude) {
    if (!hasLatitude || !hasLongitude) fail('Both branch GPS coordinates are required.');
    const cleared = body.attendanceLatitude === null && body.attendanceLongitude === null;
    if (!cleared && !validCoordinates({ latitude: body.attendanceLatitude, longitude: body.attendanceLongitude })) {
      fail('Capture valid branch GPS coordinates.');
    }
    data.attendanceLatitude = body.attendanceLatitude;
    data.attendanceLongitude = body.attendanceLongitude;
  }
  if (Object.hasOwn(body, 'attendanceRadiusMeters')) {
    if (!Number.isInteger(body.attendanceRadiusMeters) || body.attendanceRadiusMeters < 25 || body.attendanceRadiusMeters > 2000) {
      fail('Attendance radius must be between 25 and 2000 metres.');
    }
    data.attendanceRadiusMeters = body.attendanceRadiusMeters;
  }
  const merged = { ...existing, ...data, ...(Object.hasOwn(body, 'address') ? { address: String(body.address || '').trim() } : {}) };
  if (merged.attendanceUseBusinessLocation === false && !businessAttendanceLocation(merged).configured) {
    fail('Set the branch address and capture its GPS location before saving branch attendance.');
  }
  return data;
}
