import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateUgandaSalaryPreview, annualLocalServiceTax } from '../src/utils/ugandaSalaryPreview.js';

const calculate = (input = {}, employee = null) => calculateUgandaSalaryPreview({ period: '2026-09', ...input }, employee);

test('URA July 2026 example and pre-July rates use the selected month', () => {
  assert.equal(calculate({ basicSalary: 500000 }).calculation.paye, 38250);
  assert.equal(calculate({ basicSalary: 500000, period: '2026-06' }).calculation.paye, 52000);
  assert.equal(calculate({ basicSalary: 500000, period: '2025-09' }).calculation.paye, 52000);
});

test('NSSF is separate from taxable pay and cash net pay reconciles', () => {
  const c = calculate({ basicSalary: 500000 }).calculation;
  assert.equal(c.taxableIncome, 500000);
  assert.equal(c.employeeSocialSecurity, 25000);
  assert.equal(c.employerSocialSecurity, 50000);
  assert.equal(c.netSalary, 436750);
  assert.equal(c.employerCost, 550000);
  assert.equal(c.grossSalary - c.totalDeductions, c.netSalary);
});

test('non-cash and housing benefits affect tax but are not paid out as cash', () => {
  const c = calculate({ basicSalary: 3500000, housedByEmployer: true, housingValue: 600000, rentToEmployer: 50000 }).calculation;
  assert.equal(c.housingBenefit, 550000);
  assert.equal(c.taxableIncome, 4050000);
  assert.equal(c.employeeSocialSecurity, 175000);
  assert.equal(c.netSalary, c.grossSalary - c.paye - c.employeeSocialSecurity - 50000);
  const capped = calculate({ basicSalary: 1000000, nonCashBenefits: 200000, housedByEmployer: true, housingValue: 1000000 }).calculation;
  assert.equal(capped.housingBenefit, 330000);
  assert.equal(capped.taxableIncome, 1530000);
  const noHousing = calculate({ basicSalary: 1000000, housingValue: 1000000, rentToEmployer: 50000 }).calculation;
  assert.equal(noHousing.housingBenefit, 0);
  assert.equal(noHousing.rentToEmployer, 0);
});

test('LST bands, installment months, and both tax orders', () => {
  for (const [income, annual] of [[100000, 0], [100001, 5000], [300000, 10000], [600001, 60000], [1000000, 90000], [1000001, 100000]]) {
    assert.equal(annualLocalServiceTax(income), annual);
  }
  const firstLST = calculate({ basicSalary: 1000000, deductLST: true }).calculation;
  assert.equal(firstLST.localServiceTax, 22500);
  assert.equal(firstLST.taxableIncome, 977500);
  assert.equal(firstLST.paye, 181500);
  const firstPAYE = calculate({ basicSalary: 1000000, deductLST: true, payeBeforeLST: true }).calculation;
  assert.equal(firstPAYE.localServiceTax, 20000);
  assert.equal(firstPAYE.paye, 188250);
  assert.equal(firstPAYE.netSalary, 741750);
  for (let month = 1; month <= 12; month++) {
    const c = calculate({ period: `2026-${String(month).padStart(2, '0')}`, basicSalary: 2000000, deductLST: true }).calculation;
    assert.equal(c.localServiceTax, month >= 7 && month <= 10 ? 25000 : 0);
  }
});

test('gross-up round trips all LST boundaries with both tax orders and optional housing', () => {
  for (const payeBeforeLST of [false, true]) {
    for (const housedByEmployer of [false, true]) {
      for (const basicSalary of [100000, 200000, 300000, 400000, 500000, 600000, 700000, 800000, 900000, 1000000, 1100000, 10000000, 11000000]) {
        const options = { basicSalary, deductLST: true, payeBeforeLST, housedByEmployer, housingValue: 100000, rentToEmployer: 5000, otherDeductions: 1000 };
        const original = calculate(options).calculation;
        const reversed = calculate({ ...options, calculatorMode: 'gross', netPay: original.netSalary }).calculation;
        assert(reversed.netSalary >= original.netSalary);
        assert(reversed.grossSalary <= basicSalary + .01, JSON.stringify({ options, reversed }));
        assert(Math.abs(reversed.netSalary - original.netSalary) <= .02);
      }
    }
  }
});

test('gross-up includes additions and deductions without a negative basic salary', () => {
  const r = calculate({ calculatorMode: 'gross', netPay: 1000000, allowances: 20000, bonus: 10000, salaryAdvanceRecovery: 50000 });
  assert.equal(Math.round((r.input.basicSalary + 30000) * 100), Math.round(r.calculation.grossSalary * 100));
  assert.equal(r.calculation.netSalary, 1000000);
});

test('PAYE date range splits total taxable pay and handles the July change', () => {
  const c = calculate({ calculatorMode: 'paye', period: '2026-06', toMonth: 7, taxablePay: 1000000 }).calculation;
  assert.equal(c.paye, 90250);
  assert.deepEqual(c.months.map((m) => m.paye), [52000, 38250]);
  const year = calculate({ calculatorMode: 'paye', period: '2026-01', toMonth: 12, taxablePay: 6000000.01 }).calculation;
  assert.equal(Math.round(year.months.reduce((sum, m) => sum + m.taxableIncome, 0) * 100), 600000001);
});

test('show working reconciles band taxes with total PAYE', () => {
  for (const options of [{}, { residencyStatus: 'non_resident' }, { multipleEmployment: true }]) {
    const c = calculate({ basicSalary: 11000000, ...options }).calculation;
    assert.equal(c.working.reduce((sum, row) => sum + row.tax, 0), c.paye);
  }
});

test('employee salary uses a genuine zero; missing TIN does not exempt PAYE', () => {
  const employee = { id: 'employee-1', basicSalary: 1000000, taxId: null, socialSecurityNumber: null };
  assert.equal(calculate({}, employee).calculation.grossSalary, 1000000);
  assert.equal(calculate({ basicSalary: 0 }, employee).calculation.grossSalary, 0);
  const c = calculate({ payeMode: 'auto', socialSecurityMode: 'auto' }, employee).calculation;
  assert.equal(c.paye, 188250);
  assert.equal(c.employeeSocialSecurity, 0);
});

test('explicit deduction options and zero salary are respected', () => {
  const c = calculate({ basicSalary: 1000000, payeMode: 'off', socialSecurityMode: 'off' }).calculation;
  assert.equal(c.netSalary, 1000000);
  assert.equal(calculate({ basicSalary: 0 }).calculation.netSalary, 0);
  assert.equal(calculate({ basicSalary: 100, otherDeductions: 200 }).calculation.netSalary, -105);
});

test('invalid amounts, periods, flags and modes are rejected', () => {
  for (const input of [
    { basicSalary: -1 }, { basicSalary: 'NaN' }, { basicSalary: Infinity }, { basicSalary: 1e13 }, { basicSalary: true },
    { basicSalary: .001 }, { period: '2026-13' }, { period: '2026-00' }, { period: '2027-01' },
    { toMonth: 8 }, { toMonth: 13 }, { toMonth: 9.5 }, { deductLST: 'false' },
    { residencyStatus: 'other' }, { calculatorMode: 'unknown' }, { payeMode: 'invalid' },
  ]) assert.throws(() => calculate(input), RangeError, JSON.stringify(input));
});
