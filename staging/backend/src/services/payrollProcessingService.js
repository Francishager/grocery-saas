/**
 * Payroll Processing Service - Phase 4 Payroll Management
 * Handles payroll cycle processing, calculations, and salary slip generation
 */

class PayrollProcessingService {
  // Process payroll for a cycle
  async processPayroll(tenantId, cycleId, processedBy) {
    try {
      const cycle = await db.payrollCycle.findUnique({
        where: { id: cycleId, tenantId },
      });

      if (!cycle) throw new Error('Payroll cycle not found');
      if (cycle.status !== 'pending') throw new Error('Cycle already processed');

      // Get all active employees for this period
      const employees = await db.employee.findMany({
        where: {
          tenantId,
          status: 'active',
        },
        include: { salaryStructure: true },
      });

      const payrollRecords = [];

      for (const employee of employees) {
        if (!employee.salaryStructure) continue;

        const salary = employee.salaryStructure[0]; // Most recent
        const baseSalary = salary.baseSalary;

        // Calculate gross salary
        let totalEarnings = baseSalary;
        const earnings = {};
        
        // Add salary components if available
        if (salary.components && typeof salary.components === 'object') {
          for (const [componentId, amount] of Object.entries(salary.components)) {
            totalEarnings += amount;
            earnings[componentId] = amount;
          }
        }

        // Calculate deductions
        let totalDeductions = 0;
        const deductions = {};

        // Get tax brackets for this year
        const taxBrackets = await db.taxBracket.findMany({
          where: {
            tenantId,
            year: cycle.year,
            incomeFrom: { lte: baseSalary },
            incomeTo: { gte: baseSalary },
          },
        });

        if (taxBrackets.length > 0) {
          const taxRate = taxBrackets[0].rate / 100;
          const tax = baseSalary * taxRate;
          totalDeductions += tax;
          deductions['tax'] = tax;
        }

        // Apply other deductions
        const appliedDeductions = await db.deduction.findMany({
          where: {
            tenantId,
            isActive: true,
          },
        });

        for (const ded of appliedDeductions) {
          let amount = 0;
          if (ded.isPercentage) {
            amount = baseSalary * (ded.rate / 100);
          } else {
            amount = ded.rate;
          }
          if (ded.maxAmount && amount > ded.maxAmount) {
            amount = ded.maxAmount;
          }
          totalDeductions += amount;
          deductions[ded.type] = amount;
        }

        const netSalary = totalEarnings - totalDeductions;

        // Create payroll record
        const payroll = await db.employeePayroll.create({
          data: {
            tenantId,
            employeeId: employee.id,
            payrollCycleId: cycleId,
            baseSalary,
            earnings,
            deductions,
            totalEarnings,
            totalDeductions,
            netSalary,
            status: 'draft',
          },
        });

        payrollRecords.push(payroll);
      }

      // Update cycle status
      await db.payrollCycle.update({
        where: { id: cycleId },
        data: { status: 'processing' },
      });

      return {
        cycleId,
        recordsProcessed: payrollRecords.length,
        records: payrollRecords,
      };
    } catch (error) {
      throw new Error(`Failed to process payroll: ${error.message}`);
    }
  }

  // Approve payroll for processing
  async approvePayroll(tenantId, cycleId, approvedBy) {
    try {
      const cycle = await db.payrollCycle.findUnique({
        where: { id: cycleId, tenantId },
      });

      if (!cycle) throw new Error('Payroll cycle not found');
      if (cycle.status !== 'processing') {
        throw new Error('Only processing cycles can be approved');
      }

      // Update all payroll records to approved
      await db.employeePayroll.updateMany({
        where: { payrollCycleId: cycleId },
        data: { status: 'approved' },
      });

      // Update cycle
      const updated = await db.payrollCycle.update({
        where: { id: cycleId },
        data: { status: 'completed' },
      });

      return updated;
    } catch (error) {
      throw new Error(`Failed to approve payroll: ${error.message}`);
    }
  }

  // Generate salary slip for employee
  async generateSalarySlip(tenantId, employeeId, cycleId) {
    try {
      const payroll = await db.employeePayroll.findUnique({
        where: {
          employeeId_payrollCycleId: {
            employeeId,
            payrollCycleId: cycleId,
          },
        },
      });

      if (!payroll) throw new Error('Payroll record not found');

      const cycle = await db.payrollCycle.findUnique({
        where: { id: cycleId, tenantId },
      });

      if (!cycle) throw new Error('Payroll cycle not found');

      // Create salary slip
      const slip = await db.salarySlip.create({
        data: {
          tenantId,
          employeeId,
          payrollId: payroll.id,
          month: new Date(cycle.cycleStartDate).getMonth() + 1,
          year: new Date(cycle.cycleStartDate).getFullYear(),
          baseSalary: payroll.baseSalary,
          earnings: payroll.earnings,
          deductions: payroll.deductions,
          totalEarnings: payroll.totalEarnings,
          totalDeductions: payroll.totalDeductions,
          netSalary: payroll.netSalary,
        },
      });

      return slip;
    } catch (error) {
      throw new Error(`Failed to generate salary slip: ${error.message}`);
    }
  }

  // Get payroll summary for cycle
  async getPayrollSummary(tenantId, cycleId) {
    try {
      const records = await db.employeePayroll.findMany({
        where: {
          tenantId,
          payrollCycleId: cycleId,
        },
        include: {
          employee: {
            select: {
              firstName: true,
              lastName: true,
              employeeId: true,
            },
          },
        },
      });

      const summary = {
        totalRecords: records.length,
        totalEarnings: 0,
        totalDeductions: 0,
        totalNetPayable: 0,
        records,
      };

      records.forEach(r => {
        summary.totalEarnings += r.totalEarnings;
        summary.totalDeductions += r.totalDeductions;
        summary.totalNetPayable += r.netSalary;
      });

      return summary;
    } catch (error) {
      throw new Error(`Failed to get payroll summary: ${error.message}`);
    }
  }

  // Get employee payroll history
  async getEmployeePayrollHistory(tenantId, employeeId, year) {
    try {
      const records = await db.employeePayroll.findMany({
        where: {
          tenantId,
          employeeId,
          payrollCycle: {
            year,
          },
        },
        include: {
          payrollCycle: true,
        },
        orderBy: {
          payrollCycle: { cycleStartDate: 'asc' },
        },
      });

      return records;
    } catch (error) {
      throw new Error(`Failed to fetch payroll history: ${error.message}`);
    }
  }

  // Lock/finalize payroll cycle
  async lockPayrollCycle(tenantId, cycleId) {
    try {
      const updated = await db.payrollCycle.update({
        where: { id: cycleId, tenantId },
        data: { isLocked: true },
      });

      return updated;
    } catch (error) {
      throw new Error(`Failed to lock payroll cycle: ${error.message}`);
    }
  }
}

module.exports = new PayrollProcessingService();
