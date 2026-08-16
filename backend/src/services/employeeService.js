import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * EmployeeService - Manages employee lifecycle (most complex service)
 * Handles: creation, profiles, transfers, promotions, hierarchy, supervisor relationships
 */

class EmployeeService {
  /**
   * Create a new employee
   * @param {string} tenantId - Tenant ID
   * @param {object} data - Employee data
   * @returns {Promise<object>} Created employee
   */
  async createEmployee(tenantId, data) {
    const {
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth,
      employeeId,
      gender,
      maritalStatus,
      basicSalary,
      departmentId,
      unitId,
      teamId,
      positionId,
      supervisorId,
      dateOfJoining = new Date(),
      employmentStatus = 'active',
      employmentType = 'full-time',
      branch,
      address,
      city,
      state,
      country,
      zipCode,
      emergencyContact,
      emergencyPhone,
      notes,
    } = data;

    if (!firstName || !lastName || !email || !employeeId) {
      throw new Error('First name, last name, email, and employee ID are required');
    }

    // Check circular supervisor relationship
    if (supervisorId) {
      await this.validateSupervisorHierarchy(tenantId, supervisorId, null);
    }

    try {
      return await prisma.employee.create({
        data: {
          tenantId,
          firstName,
          lastName,
          email,
          phone,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          employeeId,
          gender,
          maritalStatus,
          basicSalary,
          departmentId,
          unitId,
          teamId,
          positionId,
          supervisorId,
          dateOfJoining: new Date(dateOfJoining),
          employmentStatus,
          employmentType,
          branch,
          address,
          city,
          state,
          country,
          zipCode,
          emergencyContact,
          emergencyPhone,
          notes,
          isActive: true,
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new Error(`Employee with ID '${employeeId}' already exists`);
      }
      throw error;
    }
  }

  /**
   * Get employees with filters
   * @param {string} tenantId - Tenant ID
   * @param {object} options - Filter options
   * @returns {Promise<array>} Employees list
   */
  async getEmployees(tenantId, options = {}) {
    const {
      skip = 0,
      take = 50,
      departmentId = null,
      unitId = null,
      teamId = null,
      positionId = null,
      status = 'active',
      search = null,
    } = options;

    const where = {
      tenantId,
      ...(status === 'active' ? { isActive: true } : { isActive: false }),
      ...(departmentId && { departmentId }),
      ...(unitId && { unitId }),
      ...(teamId && { teamId }),
      ...(positionId && { positionId }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { employeeId: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    return prisma.employee.findMany({
      where,
      skip,
      take,
      include: {
        department: true,
        unit: true,
        team: true,
        positionRole: true,
        supervisor: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get employee by ID
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @returns {Promise<object>} Employee data
   */
  async getEmployeeById(tenantId, employeeId) {
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        tenantId,
      },
      include: {
        department: true,
        unit: true,
        team: true,
        positionRole: true,
        supervisor: true,
        subordinates: { select: { id: true, firstName: true, lastName: true, email: true } },
        contracts: true,
        documents: true,
        salaryHistory: { orderBy: { effectiveDate: 'desc' }, take: 5 },
        employmentHistory: { orderBy: { effectiveDate: 'desc' }, take: 10 },
      },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    return employee;
  }

  /**
   * Update employee
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @param {object} data - Update data
   * @returns {Promise<object>} Updated employee
   */
  async updateEmployee(tenantId, employeeId, data) {
    await this.getEmployeeById(tenantId, employeeId);

    const {
      firstName,
      lastName,
      phone,
      gender,
      maritalStatus,
      address,
      city,
      state,
      country,
      zipCode,
      emergencyContact,
      emergencyPhone,
      notes,
    } = data;

    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = phone;
    if (gender !== undefined) updateData.gender = gender;
    if (maritalStatus !== undefined) updateData.maritalStatus = maritalStatus;
    if (address !== undefined) updateData.address = address;
    if (city !== undefined) updateData.city = city;
    if (state !== undefined) updateData.state = state;
    if (country !== undefined) updateData.country = country;
    if (zipCode !== undefined) updateData.zipCode = zipCode;
    if (emergencyContact !== undefined) updateData.emergencyContact = emergencyContact;
    if (emergencyPhone !== undefined) updateData.emergencyPhone = emergencyPhone;
    if (notes !== undefined) updateData.notes = notes;

    return await prisma.employee.update({
      where: { id: employeeId },
      data: updateData,
    });
  }

  /**
   * Soft delete employee
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @returns {Promise<object>} Deleted employee
   */
  async softDeleteEmployee(tenantId, employeeId) {
    await this.getEmployeeById(tenantId, employeeId);

    return await prisma.employee.update({
      where: { id: employeeId },
      data: { isActive: false },
    });
  }

  /**
   * Transfer employee to different department/unit/team
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @param {object} data - Transfer data
   * @param {string} transferredBy - User making transfer
   * @returns {Promise<object>} Updated employee
   */
  async transferEmployee(tenantId, employeeId, data, transferredBy) {
    const employee = await this.getEmployeeById(tenantId, employeeId);
    const { departmentId, unitId, teamId, reason } = data;

    // Record employment history
    await prisma.employmentHistory.create({
      data: {
        tenantId,
        employeeId,
        previousStatus: `${employee.departmentId}/${employee.unitId}/${employee.teamId}`,
        newStatus: `${departmentId}/${unitId}/${teamId}`,
        reason: reason || 'Transfer',
        effectiveDate: new Date(),
        recordedDate: new Date(),
        recordedBy: transferredBy,
      },
    });

    return await prisma.employee.update({
      where: { id: employeeId },
      data: {
        ...(departmentId && { departmentId }),
        ...(unitId && { unitId }),
        ...(teamId && { teamId }),
      },
    });
  }

  /**
   * Promote employee
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @param {object} data - Promotion data
   * @param {string} promotedBy - User making promotion
   * @returns {Promise<object>} Updated employee
   */
  async promoteEmployee(tenantId, employeeId, data, promotedBy) {
    const employee = await this.getEmployeeById(tenantId, employeeId);
    const { newPositionId, newSalary, reason, effectiveDate = new Date() } = data;

    if (!newPositionId) {
      throw new Error('New position is required for promotion');
    }

    // Record employment history
    await prisma.employmentHistory.create({
      data: {
        tenantId,
        employeeId,
        previousStatus: `Position: ${employee.positionId}`,
        newStatus: `Position: ${newPositionId}`,
        reason: reason || 'Promotion',
        effectiveDate: new Date(effectiveDate),
        recordedDate: new Date(),
        recordedBy: promotedBy,
      },
    });

    // Record salary change if provided
    if (newSalary) {
      await prisma.salaryHistory.create({
        data: {
          tenantId,
          employeeId,
          basicSalary: newSalary,
          effectiveDate: new Date(effectiveDate),
          reason: 'Promotion salary increase',
          approvedBy: promotedBy,
          approvedAt: new Date(),
        },
      });
    }

    return await prisma.employee.update({
      where: { id: employeeId },
      data: {
        positionId: newPositionId,
        ...(newSalary && { basicSalary: newSalary }),
      },
    });
  }

  /**
   * Assign/Change supervisor
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @param {string} newSupervisorId - New supervisor ID
   * @returns {Promise<object>} Updated employee
   */
  async assignSupervisor(tenantId, employeeId, newSupervisorId) {
    const employee = await this.getEmployeeById(tenantId, employeeId);

    // Prevent self-assignment
    if (employeeId === newSupervisorId) {
      throw new Error('Employee cannot be their own supervisor');
    }

    // Validate hierarchy to prevent circular relationships
    await this.validateSupervisorHierarchy(tenantId, newSupervisorId, employeeId);

    return await prisma.employee.update({
      where: { id: employeeId },
      data: { supervisorId: newSupervisorId },
    });
  }

  /**
   * Get employee's subordinates
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @returns {Promise<array>} Subordinates
   */
  async getSubordinates(tenantId, employeeId) {
    await this.getEmployeeById(tenantId, employeeId);

    return prisma.employee.findMany({
      where: {
        tenantId,
        supervisorId: employeeId,
      },
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

  /**
   * Validate supervisor hierarchy (prevent circular relationships)
   * @param {string} tenantId - Tenant ID
   * @param {string} supervisorId - Proposed supervisor
   * @param {string} employeeId - Employee being assigned
   * @throws {Error} If circular relationship detected
   */
  async validateSupervisorHierarchy(tenantId, supervisorId, employeeId) {
    let current = supervisorId;
    const visited = new Set();

    while (current) {
      if (visited.has(current)) {
        throw new Error('Circular supervisor relationship detected');
      }

      visited.add(current);

      if (current === employeeId) {
        throw new Error('Circular supervisor relationship would be created');
      }

      const supervisor = await prisma.employee.findFirst({
        where: { id: current, tenantId },
        select: { supervisorId: true },
      });

      current = supervisor?.supervisorId || null;
    }
  }

  /**
   * Get full reporting structure for employee
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @returns {Promise<object>} Hierarchy tree
   */
  async getReportingStructure(tenantId, employeeId) {
    const employee = await this.getEmployeeById(tenantId, employeeId);
    const subordinates = await this.getSubordinates(tenantId, employeeId);

    return {
      employee: {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        position: employee.positionRole?.name,
        supervisor: employee.supervisor
          ? `${employee.supervisor.firstName} ${employee.supervisor.lastName}`
          : null,
      },
      subordinates: subordinates.map(s => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        position: s.positionRole?.name,
      })),
    };
  }

  /**
   * Get complete employee profile
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @returns {Promise<object>} Complete profile
   */
  async getFullEmployeeProfile(tenantId, employeeId) {
    const employee = await this.getEmployeeById(tenantId, employeeId);
    const subordinates = await this.getSubordinates(tenantId, employeeId);

    return {
      personal: {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        phone: employee.phone,
        dateOfBirth: employee.dateOfBirth,
        gender: employee.gender,
        maritalStatus: employee.maritalStatus,
        address: employee.address,
        city: employee.city,
        state: employee.state,
        country: employee.country,
        zipCode: employee.zipCode,
      },
      employment: {
        employeeId: employee.employeeId,
        dateOfJoining: employee.dateOfJoining,
        employmentStatus: employee.employmentStatus,
        employmentType: employee.employmentType,
        department: employee.department?.name,
        unit: employee.unit?.name,
        team: employee.team?.name,
        position: employee.positionRole?.name,
      },
      supervision: {
        supervisor: employee.supervisor
          ? `${employee.supervisor.firstName} ${employee.supervisor.lastName}`
          : null,
        subordinates: subordinates.length,
      },
      compensation: {
        basicSalary: employee.basicSalary,
        recentSalaryHistory: employee.salaryHistory,
      },
      contracts: employee.contracts,
      documents: employee.documents,
    };
  }

  /**
   * Get employee count
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<number>} Total count
   */
  async getEmployeeCount(tenantId) {
    return prisma.employee.count({
      where: { tenantId, isActive: true },
    });
  }
}

export default new EmployeeService();
