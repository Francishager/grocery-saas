import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * EmployeeContractService - Manages employee contracts
 */

class EmployeeContractService {
  /**
   * Create a new employee contract
   * @param {string} tenantId - Tenant ID
   * @param {object} data - Contract data
   * @returns {Promise<object>} Created contract
   */
  async createContract(tenantId, data) {
    const {
      employeeId,
      contractNo,
      contractType,
      startDate,
      endDate,
      position,
      department,
      salary,
      benefits,
      probationPeriod,
      terms,
      notes,
      createdBy,
    } = data;

    if (!employeeId || !contractNo || !contractType || !startDate || !createdBy) {
      throw new Error('Employee ID, contract number, type, start date, and creator are required');
    }

    // Verify employee exists
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    try {
      return await prisma.employeeContract.create({
        data: {
          tenantId,
          employeeId,
          contractNo,
          contractType,
          status: 'active',
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : null,
          position,
          department,
          salary,
          benefits,
          probationPeriod,
          probationStartDate: new Date(startDate),
          probationEndDate: probationPeriod ? new Date(new Date(startDate).getTime() + probationPeriod * 24 * 60 * 60 * 1000) : null,
          terms,
          notes,
          createdBy,
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new Error(`Contract with number '${contractNo}' already exists`);
      }
      throw error;
    }
  }

  /**
   * Get contracts for an employee
   * @param {string} tenantId - Tenant ID
   * @param {string} employeeId - Employee ID
   * @param {object} options - Filter options
   * @returns {Promise<array>} Contracts list
   */
  async getEmployeeContracts(tenantId, employeeId, options = {}) {
    const { skip = 0, take = 50, status = null } = options;

    const where = {
      tenantId,
      employeeId,
      ...(status && { status }),
    };

    return prisma.employeeContract.findMany({
      where,
      skip,
      take,
      orderBy: { startDate: 'desc' },
    });
  }

  /**
   * Get contract by ID
   * @param {string} tenantId - Tenant ID
   * @param {string} contractId - Contract ID
   * @returns {Promise<object>} Contract data
   */
  async getContractById(tenantId, contractId) {
    const contract = await prisma.employeeContract.findFirst({
      where: {
        id: contractId,
        tenantId,
      },
      include: {
        employee: true,
      },
    });

    if (!contract) {
      throw new Error('Contract not found');
    }

    return contract;
  }

  /**
   * Update contract
   * @param {string} tenantId - Tenant ID
   * @param {string} contractId - Contract ID
   * @param {object} data - Update data
   * @returns {Promise<object>} Updated contract
   */
  async updateContract(tenantId, contractId, data) {
    const contract = await this.getContractById(tenantId, contractId);

    if (contract.status === 'terminated') {
      throw new Error('Cannot update terminated contract');
    }

    const {
      position,
      department,
      salary,
      benefits,
      terms,
      notes,
      status,
      endDate,
      renewalStatus,
    } = data;

    const updateData = {};
    if (position !== undefined) updateData.position = position;
    if (department !== undefined) updateData.department = department;
    if (salary !== undefined) updateData.salary = salary;
    if (benefits !== undefined) updateData.benefits = benefits;
    if (terms !== undefined) updateData.terms = terms;
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) updateData.status = status;
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (renewalStatus !== undefined) updateData.renewalStatus = renewalStatus;

    return await prisma.employeeContract.update({
      where: { id: contractId },
      data: updateData,
    });
  }

  /**
   * Terminate contract
   * @param {string} tenantId - Tenant ID
   * @param {string} contractId - Contract ID
   * @param {Date} terminationDate - Date of termination
   * @returns {Promise<object>} Terminated contract
   */
  async terminateContract(tenantId, contractId, terminationDate) {
    const contract = await this.getContractById(tenantId, contractId);

    if (contract.status === 'terminated') {
      throw new Error('Contract already terminated');
    }

    return await prisma.employeeContract.update({
      where: { id: contractId },
      data: {
        status: 'terminated',
        endDate: new Date(terminationDate),
      },
    });
  }

  /**
   * Get active contracts
   * @param {string} tenantId - Tenant ID
   * @param {object} options - Filter options
   * @returns {Promise<array>} Active contracts
   */
  async getActiveContracts(tenantId, options = {}) {
    const { skip = 0, take = 50 } = options;

    const now = new Date();
    return prisma.employeeContract.findMany({
      where: {
        tenantId,
        status: { in: ['active', 'expiring'] },
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      skip,
      take,
      include: {
        employee: true,
      },
      orderBy: { startDate: 'desc' },
    });
  }

  /**
   * Get expiring contracts
   * @param {string} tenantId - Tenant ID
   * @param {number} daysFromNow - Check expiry within N days
   * @returns {Promise<array>} Expiring contracts
   */
  async getExpiringContracts(tenantId, daysFromNow = 30) {
    const now = new Date();
    const expiryDate = new Date(now.getTime() + daysFromNow * 24 * 60 * 60 * 1000);

    return prisma.employeeContract.findMany({
      where: {
        tenantId,
        status: { in: ['active', 'expiring'] },
        endDate: {
          gte: now,
          lte: expiryDate,
        },
      },
      include: {
        employee: true,
      },
      orderBy: { endDate: 'asc' },
    });
  }
}

export default new EmployeeContractService();
