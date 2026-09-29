export function normalizeCustomerIdentity({ name, email, phone } = {}) {
  const normalizedName = String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  return {
    name: normalizedName,
    email: normalizedEmail || null,
    phone: normalizedPhone || null,
  };
}

export async function findCustomerIdentityConflict(client, {
  tenantId,
  identity,
  previousIdentity,
  excludeCustomerId = null,
} = {}) {
  const normalized = normalizeCustomerIdentity(identity);
  if (!tenantId || !normalized.name) return null;

  const previous = previousIdentity ? normalizeCustomerIdentity(previousIdentity) : null;
  if (previous && previous.name === normalized.name && previous.email === normalized.email && previous.phone === normalized.phone) {
    return null;
  }

  await client.$queryRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 20260929))',
    tenantId,
  );

  const [conflict] = await client.$queryRawUnsafe(`
    SELECT CASE
      WHEN lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) = $2 THEN 'name'
      WHEN $3::text IS NOT NULL AND lower(btrim(email)) = $3 THEN 'email'
      WHEN $4::text IS NOT NULL AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = $4 THEN 'phone'
    END AS field
    FROM customers
    WHERE "tenantId" = $1
      AND ($5::text IS NULL OR id <> $5)
      AND (
        lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) = $2
        OR ($3::text IS NOT NULL AND lower(btrim(email)) = $3)
        OR ($4::text IS NOT NULL AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = $4)
      )
    LIMIT 1`,
    tenantId,
    normalized.name,
    normalized.email,
    normalized.phone,
    excludeCustomerId,
  );

  return conflict?.field ? { field: conflict.field } : null;
}

export function customerIdentityConflictMessage(field) {
  const labels = { name: 'name', email: 'email address', phone: 'phone number' };
  const label = labels[field] || 'name, email address, or phone number';
  return `A customer with this ${label} already exists in this business.`;
}
