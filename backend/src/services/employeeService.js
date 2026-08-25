import prisma from '../db.js';
import { nextEmployeeNumber } from '../utils/employeeNumber.js';
import hrAccountingService from './hrAccountingService.js';

function optionalDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function defined(data) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined);
}

function money(value) {
  if (value === undefined || value === null || value === '') return 0;
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : NaN;
}

function openingAmount(data, keys, label) {
  const amount = money(firstDefined(...keys.map((key) => data[key])));
  if (!Number.isFinite(amount)) throw new Error(`${label} must be a valid amount`);
  if (amount < 0) throw new Error(`${label} cannot be negative`);
  return amount;
}

function hasOpeningInput(data) {
  return [
    'openingSalaryAdvanceBalance',
    'openingAdvanceBalance',
    'openingLoanBalance',
    'openingAdvanceLoanBalance',
    'openingSalaryPayableBalance',
    'openingSalaryBalance',
    'openingUnpaidSalaryBalance',
    'openingHrBalanceDate',
    'openingBalanceDate',
    'openingHrBalanceNote',
    'openingBalanceNote',
  ].some((key) => data[key] !== undefined);
}

function hasAnyInput(data, keys) {
  return keys.some((key) => data[key] !== undefined);
}

function openingBalanceDate(data, hasAmount, fallbackDate) {
  const explicitDate = optionalDate(data.openingHrBalanceDate || data.openingBalanceDate);
  const date = explicitDate || (hasAmount ? optionalDate(fallbackDate) : null);
  if (hasAmount && !date) throw new Error('Opening balance date is required when opening advance, loan, or salary balance is entered');
  return date;
}

function employeeName(employee) {
  return [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(' ').trim() || 'Employee';
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

  async nextOpeningAdvanceNumber(tx, tenantId) {
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const prefix = `OPEN-ADV-${todayStr}-`;
    const lastAdvance = await tx.salaryAdvance.findFirst({
      where: { tenantId, advanceNo: { startsWith: prefix } },
      orderBy: { advanceNo: 'desc' },
      select: { advanceNo: true },
    });
    const lastSequence = Number(String(lastAdvance?.advanceNo || '').split('-')[3] || 0);
    return `${prefix}${String(lastSequence + 1).padStart(3, '0')}`;
  }

  async applyOpeningBalances(tx, tenantId, employee, data, mode = 'create') {
    const advanceKeys = ['openingSalaryAdvanceBalance', 'openingAdvanceBalance', 'openingLoanBalance', 'openingAdvanceLoanBalance'];
    const payableKeys = ['openingSalaryPayableBalance', 'openingSalaryBalance', 'openingUnpaidSalaryBalance'];
    const openingSalaryAdvanceBalance = openingAmount(
      data,
      advanceKeys,
      'Opening advance/loan balance'
    );
    const openingSalaryPayableBalance = openingAmount(
      data,
      payableKeys,
      'Opening salary owed'
    );
    const effectiveOpeningSalaryAdvanceBalance = mode === 'update' && !hasAnyInput(data, advanceKeys)
      ? money(employee.openingSalaryAdvanceBalance)
      : openingSalaryAdvanceBalance;
    const effectiveOpeningSalaryPayableBalance = mode === 'update' && !hasAnyInput(data, payableKeys)
      ? money(employee.openingSalaryPayableBalance)
      : openingSalaryPayableBalance;
    const hasAmount = effectiveOpeningSalaryAdvanceBalance > 0 || effectiveOpeningSalaryPayableBalance > 0;
    const balanceDate = openingBalanceDate(data, hasAmount, data.hireDate || employee.hireDate);
    const note = String(data.openingHrBalanceNote || data.openingBalanceNote || '').trim() || null;
    const userId = data.createdBy || data.updatedBy;
    let openingWillPost = mode === 'create' && hasAmount;

    if (!hasAmount) return employee;
    if (!userId) throw new Error('A valid user is required to post HR opening balances');

    if (mode === 'update') {
      const existingAdvance = money(employee.openingSalaryAdvanceBalance);
      const existingPayable = money(employee.openingSalaryPayableBalance);
      const advanceChanged = Math.abs(effectiveOpeningSalaryAdvanceBalance - existingAdvance) > 0.01;
      const payableChanged = Math.abs(effectiveOpeningSalaryPayableBalance - existingPayable) > 0.01;
      if ((existingAdvance > 0 && advanceChanged) || (existingPayable > 0 && payableChanged)) {
        const error = new Error('Opening HR balances were already posted. Create an accounting adjustment or reversal instead of editing the original opening balance.');
        error.status = 409;
        throw error;
      }
      if (!advanceChanged && !payableChanged) return employee;
      openingWillPost = advanceChanged || payableChanged;
    }

    if (openingWillPost && !data.canManageHROpeningBalances) {
      const error = new Error('Permission denied. HR opening balances affect accounting and require HR payroll management permission.');
      error.status = 403;
      throw error;
    }

    let updatedEmployee = employee;

    if (effectiveOpeningSalaryAdvanceBalance > 0 && money(employee.openingSalaryAdvanceBalance) <= 0) {
      const advance = await tx.salaryAdvance.create({
        data: {
          tenantId,
          employeeId: employee.id,
          advanceNo: await this.nextOpeningAdvanceNumber(tx, tenantId),
          amount: effectiveOpeningSalaryAdvanceBalance,
          paymentAccountId: null,
          date: balanceDate,
          reason: note || 'Opening advance/loan balance',
          totalRecovered: 0,
          outstandingAmount: effectiveOpeningSalaryAdvanceBalance,
          recoveryMethod: 'payroll',
          recoveryPlan: 'Opening balance',
          recoveryAmount: 0,
          status: 'outstanding',
          isOpeningBalance: true,
          approvedBy: userId,
          approvedAt: balanceDate,
          paidBy: null,
          paidAt: null,
          createdBy: userId,
        },
      });

      const journalResult = await hrAccountingService.createEmployeeOpeningAdvanceJournal({
        tx,
        tenantId,
        branchId: employee.branchId,
        salaryAdvanceId: advance.id,
        amount: effectiveOpeningSalaryAdvanceBalance,
        employeeName: employeeName(employee),
        userId,
        date: balanceDate,
      });

      await tx.salaryAdvance.update({
        where: { id: advance.id },
        data: { journalEntryId: journalResult.journalEntry?.id || null },
      });

      updatedEmployee = await tx.employee.update({
        where: { id: employee.id },
        data: {
          openingSalaryAdvanceBalance: effectiveOpeningSalaryAdvanceBalance,
          openingHrBalanceDate: balanceDate,
          openingHrBalanceNote: note,
          salaryAdvanceBalance: { increment: effectiveOpeningSalaryAdvanceBalance },
        },
      });

      await hrAccountingService.createAuditLog({
        tx,
        tenantId,
        recordType: 'salary_advance',
        recordId: advance.id,
        employeeId: employee.id,
        action: 'opening_balance',
        description: `Opening advance/loan balance recorded: ${effectiveOpeningSalaryAdvanceBalance}`,
        amount: effectiveOpeningSalaryAdvanceBalance,
        userId,
        branchId: employee.branchId,
        journalEntryId: journalResult.journalEntry?.id || null,
        metadata: { openingBalance: true, note },
      });
    }

    if (effectiveOpeningSalaryPayableBalance > 0 && money(updatedEmployee.openingSalaryPayableBalance) <= 0) {
      const journalResult = await hrAccountingService.createEmployeeOpeningSalaryPayableJournal({
        tx,
        tenantId,
        branchId: updatedEmployee.branchId,
        employeeId: updatedEmployee.id,
        amount: effectiveOpeningSalaryPayableBalance,
        employeeName: employeeName(updatedEmployee),
        userId,
        date: balanceDate,
      });

      updatedEmployee = await tx.employee.update({
        where: { id: updatedEmployee.id },
        data: {
          openingSalaryPayableBalance: effectiveOpeningSalaryPayableBalance,
          openingHrBalanceDate: balanceDate,
          openingHrBalanceNote: note,
          salaryPayableBalance: { increment: effectiveOpeningSalaryPayableBalance },
        },
      });

      await hrAccountingService.createAuditLog({
        tx,
        tenantId,
        recordType: 'employee_opening_salary_payable',
        recordId: updatedEmployee.id,
        employeeId: updatedEmployee.id,
        action: 'opening_balance',
        description: `Opening salary payable recorded: ${effectiveOpeningSalaryPayableBalance}`,
        amount: effectiveOpeningSalaryPayableBalance,
        userId,
        branchId: updatedEmployee.branchId,
        journalEntryId: journalResult.journalEntry?.id || null,
        metadata: { openingBalance: true, note },
      });
    }

    return updatedEmployee;
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
    const openingSalaryAdvanceBalance = openingAmount(
      data,
      ['openingSalaryAdvanceBalance', 'openingAdvanceBalance', 'openingLoanBalance', 'openingAdvanceLoanBalance'],
      'Opening advance/loan balance'
    );
    const openingSalaryPayableBalance = openingAmount(
      data,
      ['openingSalaryPayableBalance', 'openingSalaryBalance', 'openingUnpaidSalaryBalance'],
      'Opening salary owed'
    );
    const openingHrBalanceDate = openingBalanceDate(
      data,
      openingSalaryAdvanceBalance > 0 || openingSalaryPayableBalance > 0,
      hireDate
    );
    const openingHrBalanceNote = String(data.openingHrBalanceNote || data.openingBalanceNote || '').trim() || null;

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
      openingSalaryAdvanceBalance: 0,
      openingSalaryPayableBalance: 0,
      openingHrBalanceDate,
      openingHrBalanceNote,
    };

    try {
      return await prisma.$transaction(async (tx) => {
        const employee = await tx.employee.create({ data: createData });
        const employeeWithOpeningBalances = await this.applyOpeningBalances(
          tx,
          tenantId,
          employee,
          {
            ...data,
            openingSalaryAdvanceBalance,
            openingSalaryPayableBalance,
            openingHrBalanceDate,
            openingHrBalanceNote,
            hireDate,
          },
          'create'
        );

        await tx.employmentHistory.create({
          data: {
            tenantId,
            employeeId: employeeWithOpeningBalances.id,
            employmentStatus: employeeWithOpeningBalances.status,
            position: employeeWithOpeningBalances.position || employeeWithOpeningBalances.jobTitle,
            department: employeeWithOpeningBalances.department_text,
            branch: employeeWithOpeningBalances.branchId,
            salary: employeeWithOpeningBalances.basicSalary,
            reason: 'new_employment',
            effectiveDate: employeeWithOpeningBalances.hireDate,
            recordedBy: data.createdBy || 'system',
          },
        });

        if (employeeWithOpeningBalances.basicSalary > 0) {
          await tx.salaryHistory.create({
            data: {
              tenantId,
              employeeId: employeeWithOpeningBalances.id,
              basicSalary: employeeWithOpeningBalances.basicSalary,
              grossSalary: employeeWithOpeningBalances.basicSalary,
              effectiveDate: employeeWithOpeningBalances.hireDate,
              reason: 'new_employment',
              approvedBy: data.createdBy || null,
              approvedAt: data.createdBy ? new Date() : null,
            },
          });
        }

        return employeeWithOpeningBalances;
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
    const openingInputProvided = hasOpeningInput(data);
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
      const baselineForOpeningBalances = {
        ...updated,
        openingSalaryAdvanceBalance: employee.openingSalaryAdvanceBalance,
        openingSalaryPayableBalance: employee.openingSalaryPayableBalance,
        openingHrBalanceDate: employee.openingHrBalanceDate,
        openingHrBalanceNote: employee.openingHrBalanceNote,
      };
      const employeeAfterOpeningBalances = openingInputProvided
        ? await this.applyOpeningBalances(tx, tenantId, baselineForOpeningBalances, data, 'update')
        : updated;

      if (salaryChanged) {
        await tx.salaryHistory.create({
          data: {
            tenantId,
            employeeId: employeeAfterOpeningBalances.id,
            basicSalary: employeeAfterOpeningBalances.basicSalary,
            grossSalary: employeeAfterOpeningBalances.basicSalary,
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
            employeeId: employeeAfterOpeningBalances.id,
            employmentStatus: employeeAfterOpeningBalances.status,
            position: employeeAfterOpeningBalances.position || employeeAfterOpeningBalances.jobTitle,
            department: employeeAfterOpeningBalances.department_text,
            branch: employeeAfterOpeningBalances.branchId,
            salary: employeeAfterOpeningBalances.basicSalary,
            reason: data.reason || 'profile_update',
            effectiveDate: new Date(),
            recordedBy: data.updatedBy || 'system',
          },
        });
      }

      return employeeAfterOpeningBalances;
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
        salaryAdvanceBalance: employee.salaryAdvanceBalance,
        salaryPayableBalance: employee.salaryPayableBalance,
        openingSalaryAdvanceBalance: employee.openingSalaryAdvanceBalance,
        openingSalaryPayableBalance: employee.openingSalaryPayableBalance,
        openingHrBalanceDate: employee.openingHrBalanceDate,
        openingHrBalanceNote: employee.openingHrBalanceNote,
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
