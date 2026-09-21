import prisma from '../db.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const fullName = (employee) => [employee?.firstName, employee?.middleName, employee?.lastName].filter(Boolean).join(' ');

async function employeeForLogin(db, tenantId, user) {
  const linked = await db.employee.findFirst({ where: { tenantId, userId: user.id, status: { not: 'terminated' } } });
  if (linked || !user.email) return linked;
  const matches = await db.employee.findMany({ where: { tenantId, userId: null, email: { equals: user.email, mode: 'insensitive' }, status: { not: 'terminated' } }, take: 2 });
  if (matches.length > 1) throw fail('More than one employee uses this login email. Ask HR to link the correct employee.', 409);
  return matches[0] || null;
}

export async function resolveServiceTechnician(tenantId, userId, { create = false } = {}) {
  if (!tenantId || !userId) return null;
  return prisma.$transaction(async (db) => {
    // Serialize login linking and creation so concurrent forms cannot create duplicate profiles.
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${userId}))`;
    const linked = await db.serviceTechnician.findMany({ where: { tenantId, userId }, take: 2 });
    if (linked.length > 1) throw fail('This login has multiple technician profiles. Ask an administrator to correct the links.', 409);
    if (linked.length) {
      if (!linked[0].isActive) throw fail('Your technician profile is inactive. Ask an administrator to activate it.');
      return linked[0];
    }
    const user = await db.user.findFirst({ where: { id: userId, tenantId, isActive: true } });
    if (!user) throw fail('An active business login is required.');
    const employee = await employeeForLogin(db, tenantId, user);
    const alternatives = [
      ...(employee ? [{ employeeId: employee.id }] : []),
      ...(user.email ? [{ employeeId: null, email: { equals: user.email, mode: 'insensitive' } }] : []),
    ];
    const matches = alternatives.length ? await db.serviceTechnician.findMany({ where: { tenantId, userId: null, OR: alternatives }, take: 2 }) : [];
    if (matches.length > 1) throw fail('Multiple technician profiles match your employee details. Ask an administrator to correct the links.', 409);
    if (matches.length) {
      if (!matches[0].isActive) throw fail('Your technician profile is inactive. Ask an administrator to activate it.');
      return db.serviceTechnician.update({ where: { id: matches[0].id }, data: { userId, ...(employee && { employeeId: employee.id }) } });
    }
    if (!create) return null;
    return db.serviceTechnician.create({ data: {
      tenantId, userId, employeeId: employee?.id || null,
      name: fullName(employee) || [user.fname, user.lname].filter(Boolean).join(' ') || user.email,
      email: employee?.email || user.email || null, phone: employee?.phone || user.phone || null,
      role: employee?.jobTitle || employee?.position || 'technician',
      branchId: employee?.branchId || user.branchId || null, hireDate: employee?.hireDate || null,
    } });
  });
}

export async function technicianEmployeeLink(tenantId, employeeId, requestedUserId) {
  const employee = employeeId ? await prisma.employee.findFirst({ where: { id: employeeId, tenantId, status: { not: 'terminated' } } }) : null;
  if (employeeId && !employee) throw fail('Select an active HR employee from this business.');
  let userId = employee?.userId || requestedUserId || null;
  if (employee?.userId && requestedUserId && requestedUserId !== employee.userId) throw fail('The selected login does not belong to this employee.');
  if (!userId && employee?.email) {
    const user = await prisma.user.findFirst({ where: { tenantId, email: { equals: employee.email, mode: 'insensitive' }, isActive: true } });
    userId = user?.id || null;
  }
  if (userId && !await prisma.user.findFirst({ where: { id: userId, tenantId, isActive: true } })) throw fail('Select an active login from this business.');
  return { employee, userId };
}
