export function canUploadRentalItemImage(user, product) {
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  if (permissions.includes('*') || permissions.includes('canEditRental')) return true;
  return permissions.includes('canCreateRental')
    && Boolean(user?.id)
    && product?.createdByUserId === user.id
    && !product?.image;
}
