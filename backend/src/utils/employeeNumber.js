const lettersOnly = (value = '') => String(value).replace(/[^a-zA-Z]/g, '').toUpperCase();

function firstLetters(value = '', length = 2) {
  const words = String(value).trim().split(/\s+/).filter(Boolean);
  const initials = words.map((word) => lettersOnly(word).charAt(0)).join('');
  const compact = initials.length >= length ? initials : lettersOnly(value);
  return compact.slice(0, length).padEnd(length, 'X');
}

export function buildEmployeeNumberPrefix({ businessName, firstName, lastName }) {
  const businessPart = firstLetters(businessName, 2);
  const staffSource = [firstName, lastName].filter(Boolean).join(' ');
  const staffPart = firstLetters(staffSource, 2);
  return `${businessPart}${staffPart}`.slice(0, 4).padEnd(4, 'X');
}

export async function nextEmployeeNumber(prisma, tenantId, { firstName, lastName } = {}) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  const prefix = buildEmployeeNumberPrefix({
    businessName: tenant?.name || 'Business',
    firstName,
    lastName,
  });

  const employees = await prisma.employee.findMany({
    where: { tenantId, employeeNumber: { startsWith: prefix } },
    select: { employeeNumber: true },
  });

  const highest = employees.reduce((max, employee) => {
    const suffix = String(employee.employeeNumber || '').slice(prefix.length);
    const value = /^\d+$/.test(suffix) ? Number(suffix) : 0;
    return Math.max(max, value);
  }, 0);

  for (let sequence = highest + 1; sequence <= 999999; sequence += 1) {
    const employeeNumber = `${prefix}${String(sequence).padStart(6, '0')}`;
    const existing = await prisma.employee.findFirst({
      where: { tenantId, employeeNumber },
      select: { id: true },
    });
    if (!existing) return employeeNumber;
  }

  throw new Error('No available staff number sequence for this business and employee name prefix');
}
