const STAFF_NUMBER_PREFIX_LENGTH = 5;
const STAFF_NUMBER_SEQUENCE_LENGTH = 5;
const STAFF_NUMBER_MAX_SEQUENCE = 99999;

const lettersOnly = (value = '') => String(value).replace(/[^a-zA-Z]/g, '').toUpperCase();

function firstLetters(value = '', length = 2) {
  const words = String(value).trim().split(/\s+/).filter(Boolean);
  const initials = words.map((word) => lettersOnly(word).charAt(0)).join('');
  const compact = initials.length >= length ? initials : lettersOnly(value);
  return compact.slice(0, length).padEnd(length, 'X');
}

export function buildEmployeeNumberPrefix({ businessName, firstName, middleName, lastName }) {
  const businessPart = firstLetters(businessName, 2);
  const staffSource = [firstName, middleName, lastName].filter(Boolean).join(' ');
  const staffPart = firstLetters(staffSource, 3);
  return `${businessPart}${staffPart}`.slice(0, STAFF_NUMBER_PREFIX_LENGTH).padEnd(STAFF_NUMBER_PREFIX_LENGTH, 'X');
}

export async function nextEmployeeNumber(prisma, tenantId, { firstName, middleName, lastName } = {}) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  const prefix = buildEmployeeNumberPrefix({
    businessName: tenant?.name || 'Business',
    firstName,
    middleName,
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

  for (let sequence = highest + 1; sequence <= STAFF_NUMBER_MAX_SEQUENCE; sequence += 1) {
    const employeeNumber = `${prefix}${String(sequence).padStart(STAFF_NUMBER_SEQUENCE_LENGTH, '0')}`;
    const existing = await prisma.employee.findFirst({
      where: { tenantId, employeeNumber },
      select: { id: true },
    });
    if (!existing) return employeeNumber;
  }

  throw new Error('No available staff number sequence for this business and employee name prefix');
}
