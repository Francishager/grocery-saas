export function fuelVehicleInvoiceError(vehicle, { customerId, fuelType } = {}) {
  if (!vehicle || vehicle.isActive !== true || vehicle.isAuthorized !== true) {
    return 'Vehicle is inactive, unauthorized, or outside the selected branch.';
  }
  if (vehicle.customerId && vehicle.customerId !== customerId) {
    return 'This vehicle is registered to a different customer.';
  }
  if (vehicle.fuelType && vehicle.fuelType.toLowerCase() !== String(fuelType || '').toLowerCase()) {
    return `This vehicle is registered for ${vehicle.fuelType}, not ${fuelType}.`;
  }
  return null;
}
