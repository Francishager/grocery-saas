import prisma from '../db.js';
import { nextEmployeeNumber } from '../utils/employeeNumber.js';

function optionalDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function defined(data) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

function normalizeNationalId(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!normalized) return null;
  if (!/^[A-Z0-9]{14}$/.test(normalized)) {
    throw new Error('Ugandan NIN must be exactly 14 letters and digits');
  }
  return normalized;
}

function normalizeTenDigitNumber(value, label) {
  const normalized = String(value || '').replace(/\D/g, '');
  if (!normalized) return null;
  if (!/^\d{10}$/.test(normalized)) {
    throw new Error(`${label} must be exactly 10 digits`);
  }
  return normalized;
}

class EmployeeService {
  async nextEmployeeNumber(tenantId) {
    return nextEmployeeNumber(prisma, tenantId);
  }

  async ensureEmployeeNumbers(tenantId) {
    const missingEmployees = await prisma.employee.findMany({
      where: {
        tenantId,
        OR: [
          { employeeNumber: null },
          { employeeNumber: '' },
        ],
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { createdAt: 'asc' },
    });

    for (const employee of missingEmployees) {
      const employeeNumber = await nextEmployeeNumber(prisma, tenantId, {
        firstName: employee.firstName,
        lastName: employee.lastName,
      });
      await prisma.employee.update({
        where: { id: employee.id },
        data: { employeeNumber },
      });
    }

    return missingEmployees.length;
  }

  async validateTenantEmployee(tenantId, employeeId, label = 'Employee') {
    const employee = await prisma.employee.findFirst({ where: { id: employeeId, tenantId } });
    if (!employee) throw new Error(`${label} not found`);
    return employee;
  }

  async createEmployee(tenantId, data) {
    const firstName = String(data.firstName || '').trim();
    const lastName = String(data.lastName || '').trim();
    if (!firstName || !lastName) throw new Error('First name and last name are required');

    if (data.supervisorId) {
      await this.validateSupervisorHierarchy(tenantId, data.supervisorId, null);
    }

    const basicSalary = Number(data.basicSalary ?? data.salary ?? 0) || 0;
    const hireDate = optionalDate(data.hireDate || data.dateOfJoining) || new Date();
    const employeeNumber = await nextEmployeeNumber(prisma, tenantId, { firstName, lastName });
    const status = data.status || data.employmentStatus || 'active';
    const nationalId = normalizeNationalId(data.nationalId ?? data.idNumber);
    const taxId = normalizeTenDigitNumber(data.taxId, 'Employee PAYE TIN');
    const socialSecurityNumber = normalizeTenDigitNumber(
      data.socialSecurityNumber ?? data.socialSecurityNo ?? data.nssfNumber,
      'Employee social security number'
    );

    const createData = {
      tenantId,
      branchId: data.branchId || null,
      firstName,
      middleName: data.middleName || null,
      lastName,
      employeeNumber,
      profilePhoto: data.profilePhoto || null,
      email: data.email || null,
      phone: data.phone || null,
      gender: data.gender || null,
      dateOfBirth: optionalDate(data.dateOfBirth),
      nationality: data.nationality || null,
      maritalStatus: data.maritalStatus || null,
      bloodType: data.bloodType || null,
      nationalId,
      nationalIdType: data.nationalIdType || null,
      taxId,
      socialSecurityNumber,
      address: data.address || null,
      city: data.city || null,
      state: data.state || null,
      postalCode: data.postalCode || data.zipCode || null,
      emergencyContactName: data.emergencyContactName || data.emergencyContact || null,
      emergencyContactPhone: data.emergencyContactPhone || data.emergencyPhone || null,
      emergencyContactRelationship: data.emergencyContactRelationship || null,
      nextOfKinName: data.nextOfKinName || null,
      nextOfKinPhone: data.nextOfKinPhone || null,
      nextOfKinRelationship: data.nextOfKinRelationship || null,
      bankName: data.bankName || null,
      bankAccountNumber: data.bankAccountNumber || null,
      bankAccountType: data.bankAccountType || null,
      bankSortCode: data.bankSortCode || null,
      bankSwiftCode: data.bankSwiftCode || null,
      departmentId: data.departmentId || null,
      positionId: data.positionId || null,
      supervisorId: data.supervisorId || null,
      teamId: data.teamId || null,
      unitId: data.unitId || null,
      position: data.position || null,
      department_text: data.department || data.department_text || null,
      jobTitle: data.jobTitle || data.position || null,
      basicSalary,
      payFrequency: data.payFrequency || 'monthly',
      employmentType: data.employmentType || 'permanent',
      workLocation: data.workLocation || null,
      costCentre: data.costCentre || null,
      probationStartDate: optionalDate(data.probationStartDate),
      probationEndDate: optionalDate(data.probationEndDate),
      contractStartDate: optionalDate(data.contractStartDate),
      contractEndDate: optionalDate(data.contractEndDate),
      hireDate,
      terminationDate: optionalDate(data.terminationDate),
      status,
    };

    try {
      return await prisma.$transaction(async (tx) => {
        const employee = await tx.employee.create({ data: createData });

        await tx.employmentHistory.create({
          data: {
            tenantId,
            employeeId: employee.id,
            employmentStatus: employee.status,
            position: employee.position || employee.jobTitle,
            department: employee.department_text,
            branch: employee.branchId,
            salary: employee.basicSalary,
            reason: 'new_employment',
            effectiveDate: employee.hireDate,
            recordedBy: data.createdBy || 'system',
          },
        });

        if (employee.basicSalary > 0) {
          await tx.salaryHistory.create({
            data: {
              tenantId,
              employeeId: employee.id,
              basicSalary: employee.basicSalary,
              grossSalary: employee.basicSalary,
              effectiveDate: employee.hireDate,
              reason: 'new_employment',
              approvedBy: data.createdBy || null,
              approvedAt: data.createdBy ? new Date() : null,
            },
          });
        }

        return employee;
      });
    } catch (error) {
      if (error.code === 'P2002') throw new Error(`Employee number '${employeeNumber}' already exists`);
      throw error;
    }
  }

  async getEmployees(tenantId, options = {}) {
    await this.ensureEmployeeNumbers(tenantId);

    const {
      skip = 0,
      take = 50,
      departmentId = null,
      unitId = null,
      teamId = null,
      positionId = null,
      status = null,
      search = null,
    } = options;

    const where = {
      tenantId,
      ...(status && status !== 'all' ? { status } : {}),
      ...(departmentId && { departmentId }),
      ...(unitId && { unitId }),
      ...(teamId && { teamId }),
      ...(positionId && { positionId }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { middleName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { employeeNumber: { contains: search, mode: 'insensitive' } },
          { nationalId: { contains: search, mode: 'insensitive' } },
          { taxId: { contains: search, mode: 'insensitive' } },
          { socialSecurityNumber: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    return prisma.employee.findMany({
      where,
      skip,
      take,
      include: {
        branch: { select: { id: true, name: true } },
        department: true,
        unit: true,
        team: true,
        positionRole: true,
        supervisor: { select: { id: true, firstName: true, lastName: true } },
        employeeDocuments: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getEmployeeById(tenantId, employeeId) {
    await this.ensureEmployeeNumbers(tenantId);

    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      include: {
        branch: { select: { id: true, name: true } },
        department: true,
        unit: true,
        team: true,
        positionRole: true,
        supervisor: true,
        subordinates: { select: { id: true, firstName: true, lastName: true, email: true } },
        employeeContracts: true,
        employeeDocuments: true,
        salaryHistories: { orderBy: { effectiveDate: 'desc' }, take: 5 },
        employmentHistories: { orderBy: { effectiveDate: 'desc' }, take: 10 },
      },
    });

    if (!employee) throw new Error('Employee not found');
    return employee;
  }

  async updateEmployee(tenantId, employeeId, data) {
    const employee = await this.getEmployeeById(tenantId, employeeId);
    if (data.supervisorId && data.supervisorId !== employee.supervisorId) {
      if (data.supervisorId === employeeId) throw new Error('Employee cannot be their own supervisor');
      await this.validateSupervisorHierarchy(tenantId, data.supervisorId, employeeId);
    }

    const nationalId = data.nationalId !== undefined || data.idNumber !== undefined
      ? normalizeNationalId(data.nationalId ?? data.idNumber)
      : undefined;
    const taxId = data.taxId !== undefined
      ? normalizeTenDigitNumber(data.taxId, 'Employee PAYE TIN')
      : undefined;
    const socialSecurityNumber =
      data.socialSecurityNumber !== undefined || data.socialSecurityNo !== undefined || data.nssfNumber !== undefined
        ? normalizeTenDigitNumber(
            data.socialSecurityNumber ?? data.socialSecurityNo ?? data.nssfNumber,
            'Employee social security number'
          )
        : undefined;

    const updateData = defined({
      branchId: data.branchId,
      firstName: data.firstName,
      middleName: data.middleName,
      lastName: data.lastName,
      profilePhoto: data.profilePhoto,
      email: data.email,
      phone: data.phone,
      gender: data.gender,
      dateOfBirth: data.dateOfBirth !== undefined ? optionalDate(data.dateOfBirth) : undefined,
      nationality: data.nationality,
      maritalStatus: data.maritalStatus,
      bloodType: data.bloodType,
      nationalId,
      nationalIdType: data.nationalIdType,
      taxId,
      socialSecurityNumber,
      address: data.address,
      city: data.city,
      state: data.state,
      postalCode: data.postalCode ?? data.zipCode,
      emergencyContactName: data.emergencyContactName ?? data.emergencyContact,
      emergencyContactPhone: data.emergencyContactPhone ?? data.emergencyPhone,
      emergencyContactRelationship: data.emergencyContactRelationship,
      nextOfKinName: data.nextOfKinName,
      nextOfKinPhone: data.nextOfKinPhone,
      nextOfKinRelationship: data.nextOfKinRelationship,
      departmentId: data.departmentId,
      unitId: data.unitId,
      teamId: data.teamId,
      positionId: data.positionId,
      supervisorId: data.supervisorId,
      position: data.position,
      department_text: data.department ?? data.department_text,
      jobTitle: data.jobTitle ?? data.position,
      basicSalary: data.basicSalary !== undefined || data.salary !== undefined ? Number(data.basicSalary ?? data.salary ?? 0) : undefined,
      payFrequency: data.payFrequency,
      employmentType: data.employmentType,
      workLocation: data.workLocation,
      costCentre: data.costCentre,
      probationStartDate: data.probationStartDate !== undefined ? optionalDate(data.probationStartDate) : undefined,
      probationEndDate: data.probationEndDate !== undefined ? optionalDate(data.probationEndDate) : undefined,
      contractStartDate: data.contractStartDate !== undefined ? optionalDate(data.contractStartDate) : undefined,
      contractEndDate: data.contractEndDate !== undefined ? optionalDate(data.contractEndDate) : undefined,
      hireDate: data.hireDate !== undefined || data.dateOfJoining !== undefined ? optionalDate(data.hireDate || data.dateOfJoining) : undefined,
      terminationDate: data.terminationDate !== undefined ? optionalDate(data.terminationDate) : undefined,
      status: data.status ?? data.employmentStatus,
    });

    const salaryChanged = updateData.basicSalary !== undefined && Number(updateData.basicSalary) !== Number(employee.basicSalary || 0);
    const employmentChanged = ['status', 'position', 'department_text', 'branchId', 'departmentId', 'positionId'].some((field) => updateData[field] !== undefined && updateData[field] !== employee[field]);

    return prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id: employeeId },
        data: updateData,
      });

      if (salaryChanged) {
        await tx.salaryHistory.create({
          data: {
            tenantId,
            employeeId,
            basicSalary: updated.basicSalary,
            grossSalary: updated.basicSalary,
            effectiveDate: new Date(),
            reason: data.salaryChangeReason || 'adjustment',
            approvedBy: data.updatedBy || null,
            approvedAt: data.updatedBy ? new Date() : null,
          },
        });
      }

      if (employmentChanged) {
        await tx.employmentHistory.create({
          data: {
            tenantId,
            employeeId,
            employmentStatus: updated.status,
            position: updated.position || updated.jobTitle,
            department: updated.department_text,
            branch: updated.branchId,
            salary: updated.basicSalary,
            reason: data.reason || 'profile_update',
            effectiveDate: new Date(),
            recordedBy: data.updatedBy || 'system',
          },
        });
      }

      return updated;
    });
  }

  async softDeleteEmployee(tenantId, employeeId) {
    await this.getEmployeeById(tenantId, employeeId);
    return prisma.employee.update({
      where: { id: employeeId },
      data: {
        status: 'inactive',
        terminationDate: new Date(),
      },
    });
  }

  async transferEmployee(tenantId, employeeId, data, transferredBy) {
    const employee = await this.getEmployeeById(tenantId, employeeId);

    return prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id: employeeId },
        data: defined({
          branchId: data.branchId,
          departmentId: data.departmentId,
          unitId: data.unitId,
          teamId: data.teamId,
        }),
      });

      await tx.employmentHistory.create({
        data: {
          tenantId,
          employeeId,
          employmentStatus: updated.status,
          position: updated.position || updated.jobTitle,
          department: updated.department_text,
          branch: updated.branchId,
          salary: updated.basicSalary,
          reason: data.reason || 'transfer',
          effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : new Date(),
          recordedBy: transferredBy || 'system',
          notes: `Previous branch/department/unit/team: ${employee.branchId || '-'}/${employee.departmentId || '-'}/${employee.unitId || '-'}/${employee.teamId || '-'}`,
        },
      });

      return updated;
    });
  }

  async promoteEmployee(tenantId, employeeId, data, promotedBy) {
    const employee = await this.getEmployeeById(tenantId, employeeId);
    if (!data.newPositionId) throw new Error('New position is required for promotion');
    const effectiveDate = data.effectiveDate ? new Date(data.effectiveDate) : new Date();

    return prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id: employeeId },
        data: {
          positionId: data.newPositionId,
          ...(data.newSalary !== undefined ? { basicSalary: Number(data.newSalary) || 0 } : {}),
        },
      });

      await tx.employmentHistory.create({
        data: {
          tenantId,
          employeeId,
          employmentStatus: updated.status,
          position: updated.position || updated.jobTitle,
          department: updated.department_text,
          branch: updated.branchId,
          salary: updated.basicSalary,
          reason: data.reason || 'promotion',
          effectiveDate,
          recordedBy: promotedBy || 'system',
          notes: `Previous position: ${employee.positionId || employee.position || '-'}`,
        },
      });

      if (data.newSalary !== undefined) {
        await tx.salaryHistory.create({
          data: {
            tenantId,
            employeeId,
            basicSalary: updated.basicSalary,
            grossSalary: updated.basicSalary,
            effectiveDate,
            reason: 'promotion',
            approvedBy: promotedBy || null,
            approvedAt: new Date(),
          },
        });
      }

      return updated;
    });
  }

  async assignSupervisor(tenantId, employeeId, newSupervisorId) {
    await this.getEmployeeById(tenantId, employeeId);
    if (employeeId === newSupervisorId) throw new Error('Employee cannot be their own supervisor');
    await this.validateSupervisorHierarchy(tenantId, newSupervisorId, employeeId);
    return prisma.employee.update({ where: { id: employeeId }, data: { supervisorId: newSupervisorId || null } });
  }

  async getSubordinates(tenantId, employeeId) {
    await this.getEmployeeById(tenantId, employeeId);
    return prisma.employee.findMany({
      where: { tenantId, supervisorId: employeeId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        positionRole: true,
        department: true,
      },
    });
  }

  async validateSupervisorHierarchy(tenantId, supervisorId, employeeId) {
    if (!supervisorId) return;
    let current = supervisorId;
    const visited = new Set();

    while (current) {
      if (visited.has(current)) throw new Error('Circular supervisor relationship detected');
      visited.add(current);
      if (current === employeeId) throw new Error('Circular supervisor relationship would be created');
      const supervisor = await prisma.employee.findFirst({
        where: { id: current, tenantId },
        select: { supervisorId: true },
      });
      if (!supervisor) throw new Error('Supervisor not found');
      current = supervisor.supervisorId || null;
    }
  }

  async getReportingStructure(tenantId, employeeId) {
    const employee = await this.getEmployeeById(tenantId, employeeId);
    const subordinates = await this.getSubordinates(tenantId, employeeId);
    return {
      employee: {
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        name: [employee.firstName, employee.lastName].filter(Boolean).join(' '),
        position: employee.positionRole?.name || employee.position || employee.jobTitle,
        supervisor: employee.supervisor ? [employee.supervisor.firstName, employee.supervisor.lastName].filter(Boolean).join(' ') : null,
      },
      subordinates: subordinates.map((subordinate) => ({
        id: subordinate.id,
        name: [subordinate.firstName, subordinate.lastName].filter(Boolean).join(' '),
        position: subordinate.positionRole?.name,
      })),
    };
  }

  async getFullEmployeeProfile(tenantId, employeeId) {
    const employee = await this.getEmployeeById(tenantId, employeeId);
    const subordinates = await this.getSubordinates(tenantId, employeeId);
    return {
      personal: {
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        profilePhoto: employee.profilePhoto,
        firstName: employee.firstName,
        middleName: employee.middleName,
        lastName: employee.lastName,
        email: employee.email,
        phone: employee.phone,
        dateOfBirth: employee.dateOfBirth,
        gender: employee.gender,
        nationality: employee.nationality,
        nationalId: employee.nationalId,
        taxId: employee.taxId,
        socialSecurityNumber: employee.socialSecurityNumber,
        address: employee.address,
        emergencyContactName: employee.emergencyContactName,
        emergencyContactPhone: employee.emergencyContactPhone,
        nextOfKinName: employee.nextOfKinName,
        nextOfKinPhone: employee.nextOfKinPhone,
      },
      employment: {
        hireDate: employee.hireDate,
        status: employee.status,
        employmentType: employee.employmentType,
        branch: employee.branch?.name,
        department: employee.department?.name || employee.department_text,
        unit: employee.unit?.name,
        team: employee.team?.name,
        position: employee.positionRole?.name || employee.position || employee.jobTitle,
        workLocation: employee.workLocation,
        costCentre: employee.costCentre,
      },
      supervision: {
        supervisor: employee.supervisor ? [employee.supervisor.firstName, employee.supervisor.lastName].filter(Boolean).join(' ') : null,
        subordinates: subordinates.length,
      },
      compensation: {
        basicSalary: employee.basicSalary,
        recentSalaryHistory: employee.salaryHistories,
      },
      contracts: employee.employeeContracts,
      documents: employee.employeeDocuments,
      history: employee.employmentHistories,
    };
  }

  async getEmployeeCount(tenantId, options = {}) {
    return prisma.employee.count({
      where: { tenantId, ...(options.status ? { status: options.status } : {}) },
    });
  }
}

export default new EmployeeService();
