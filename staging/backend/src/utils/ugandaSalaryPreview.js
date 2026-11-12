import { calculateUgandaPaye, UGANDA_PAYROLL_RULES } from './ugandaPayrollCalculator.js';

const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const MAX_AMOUNT = 1_000_000_000_000;
const LST_BANDS = [
  [100000, 0], [200000, 5000], [300000, 10000], [400000, 20000],
  [500000, 30000], [600000, 40000], [700000, 60000], [800000, 70000],
  [900000, 80000], [1000000, 90000], [Infinity, 100000],
];

export function annualLocalServiceTax(income) {
  return LST_BANDS.find(([ceiling]) => income <= ceiling)[1];
}

function amount(value, label) {
  if (value === undefined || value === null || value === '') return 0;
  if (!['number', 'string'].includes(typeof value)) throw new RangeError(`${label} must be a valid amount.`);
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || result > MAX_AMOUNT) {
    throw new RangeError(`${label} must be between 0 and ${MAX_AMOUNT}.`);
  }
  if (Math.abs(result * 100 - Math.round(result * 100)) > 0.01) {
    throw new RangeError(`${label} must have at most two decimal places.`);
  }
  return money(result);
}

function choice(value, fallback, choices, label) {
  const result = value ?? fallback;
  if (!choices.includes(result)) throw new RangeError(`Invalid ${label}.`);
  return result;
}

function flag(value, fallback, label) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new RangeError(`${label} must be true or false.`);
  return value;
}

export function normalizeSalaryInput(params, employee = null) {
  if (typeof params.period !== 'string' || !/^202[56]-(0[1-9]|1[0-2])$/.test(params.period)) {
    throw new RangeError('Select a valid month in 2025 or 2026.');
  }
  const mode = choice(params.calculatorMode, 'net', ['net', 'gross', 'paye'], 'calculator mode');
  const payeMode = choice(params.payeMode, 'on', ['on', 'off', 'auto'], 'PAYE option');
  const socialSecurityMode = choice(params.socialSecurityMode, 'on', ['on', 'off', 'auto'], 'NSSF option');
  const input = {
    calculatorMode: mode, period: params.period, employeeId: employee?.id || null,
    residencyStatus: choice(params.residencyStatus, 'resident', ['resident', 'non_resident'], 'residency'),
    multipleEmployment: flag(params.multipleEmployment, false, 'Multiple employment'),
    housedByEmployer: flag(params.housedByEmployer, false, 'Employer housing'),
    deductLST: flag(params.deductLST, false, 'LST'),
    payeBeforeLST: flag(params.payeBeforeLST, false, 'Tax order'),
    showWorking: flag(params.showWorking, true, 'Show working'),
    payeMode, socialSecurityMode,
    // A missing TIN is not a tax exemption. "auto" remains supported for older clients.
    taxEnabled: mode === 'paye' || payeMode !== 'off',
    socialSecurityEnabled: socialSecurityMode === 'on' || (socialSecurityMode === 'auto' && (!employee || Boolean(employee.socialSecurityNumber))),
  };
  for (const [key, label] of Object.entries({
    basicSalary: 'Gross pay', allowances: 'Allowances', bonus: 'Bonus', overtime: 'Overtime',
    otherEarnings: 'Other earnings', healthInsurance: 'Health insurance', otherDeductions: 'Other deductions',
    salaryAdvanceRecovery: 'Advance recovery', nonCashBenefits: 'Non-cash benefits', housingValue: 'Housing value',
    rentToEmployer: 'Rent to employer', netPay: 'Net pay', taxablePay: 'Taxable pay',
  })) {
    const value = key === 'basicSalary' && (params[key] === undefined || params[key] === '')
      ? employee?.basicSalary : params[key];
    input[key] = amount(value, label);
  }
  input.toMonth = params.toMonth === undefined ? Number(params.period.slice(5)) : Number(params.toMonth);
  if (!Number.isInteger(input.toMonth) || input.toMonth < Number(params.period.slice(5)) || input.toMonth > 12) {
    throw new RangeError('The end month must be on or after the start month in the same year.');
  }
  return input;
}

export function payeWorking(income, options) {
  let bands;
  if (options.multipleEmployment) bands = [[Infinity, .3]];
  else if (options.residencyStatus === 'non_resident') bands = [[335000, .1], [410000, .2], [10000000, .3], [Infinity, .4]];
  else if (options.period >= '2026-07') bands = [[335000, 0], [410000, .2], [485000, .25], [10000000, .3], [Infinity, .4]];
  else bands = [[235000, 0], [335000, .1], [410000, .2], [10000000, .3], [Infinity, .4]];
  let from = 0;
  return bands.map(([to, rate]) => {
    const taxableAmount = money(Math.max(0, Math.min(income, to) - from));
    const row = { from, to: Number.isFinite(to) ? to : null, rate, taxableAmount, tax: money(taxableAmount * rate) };
    from = to;
    return row;
  }).filter((row) => row.taxableAmount > 0);
}

function monthlyCalculation(input, grossSalary, fixedLST) {
  const rent = input.housedByEmployer ? input.rentToEmployer : 0;
  const netHousingValue = input.housedByEmployer ? Math.max(0, input.housingValue - rent) : 0;
  // Income Tax Act, Fifth Schedule: lesser of net market rent and 15% of employment income including that rent.
  const housingBenefit = money(Math.min(netHousingValue, .15 * (grossSalary + input.nonCashBenefits + netHousingValue)));
  const employmentIncome = money(grossSalary + input.nonCashBenefits + housingBenefit);
  const initialPaye = input.taxEnabled ? calculateUgandaPaye(employmentIncome, input).amount : 0;
  const lstBasis = money(Math.max(0, grossSalary - (input.payeBeforeLST ? initialPaye : 0)));
  const annualLST = input.deductLST ? annualLocalServiceTax(lstBasis) : 0;
  const month = Number(input.period.slice(5));
  const lstDue = input.deductLST && month >= 7 && month <= 10;
  const localServiceTax = fixedLST ?? (lstDue ? annualLST / 4 : 0);
  const taxableIncome = money(Math.max(0, employmentIncome - (input.payeBeforeLST ? 0 : localServiceTax)));
  const tax = calculateUgandaPaye(taxableIncome, input);
  const paye = input.taxEnabled ? tax.amount : 0;
  const employeeSocialSecurity = input.socialSecurityEnabled ? money(grossSalary * .05) : 0;
  const employerSocialSecurity = input.socialSecurityEnabled ? money(grossSalary * .1) : 0;
  const manualDeductions = money(input.healthInsurance + input.otherDeductions + input.salaryAdvanceRecovery + rent);
  const employeeStatutoryDeductions = money(paye + employeeSocialSecurity + localServiceTax);
  const totalDeductions = money(employeeStatutoryDeductions + manualDeductions);
  return {
    grossSalary, housingBenefit, nonCashBenefits: input.nonCashBenefits, employmentIncome, taxableIncome,
    paye, payeSchedule: tax.schedule, payeScheduleLabel: input.taxEnabled ? tax.scheduleLabel : 'PAYE not applied',
    employeeSocialSecurity, employerSocialSecurity, totalSocialSecurity: money(employeeSocialSecurity + employerSocialSecurity),
    localServiceTax, annualLST, lstBasis, rentToEmployer: rent, manualDeductions, employeeStatutoryDeductions,
    totalDeductions, netSalary: money(grossSalary - totalDeductions), employerCost: money(grossSalary + employerSocialSecurity),
    working: input.taxEnabled ? payeWorking(taxableIncome, input) : [], rules: UGANDA_PAYROLL_RULES,
  };
}

function grossUp(input) {
  const month = Number(input.period.slice(5));
  const installments = input.deductLST && month >= 7 && month <= 10 ? LST_BANDS.map(([, annual]) => annual / 4) : [0];
  const earnings = money(input.allowances + input.bonus + input.overtime + input.otherEarnings);
  const candidates = [];
  // Net pay drops at LST band boundaries. Search each fixed installment separately, then validate its actual band.
  for (const installment of installments) {
    let low = Math.round(earnings * 100);
    let high = MAX_AMOUNT * 100;
    if (monthlyCalculation(input, high / 100, installment).netSalary < input.netPay) continue;
    while (low < high) {
      const mid = low + Math.floor((high - low) / 2);
      if (monthlyCalculation(input, mid / 100, installment).netSalary >= input.netPay) high = mid;
      else low = mid + 1;
    }
    const result = monthlyCalculation(input, low / 100);
    if (result.localServiceTax === installment && result.netSalary >= input.netPay) candidates.push(result);
  }
  candidates.sort((a, b) => a.grossSalary - b.grossSalary);
  if (!candidates.length) throw new RangeError('The requested net pay exceeds the supported gross pay limit.');
  return candidates[0];
}

export function calculateUgandaSalaryPreview(params, employee = null) {
  const input = normalizeSalaryInput(params, employee);
  let calculation;
  if (input.calculatorMode === 'paye') {
    const firstMonth = Number(input.period.slice(5));
    const count = input.toMonth - firstMonth + 1;
    const cents = Math.round(input.taxablePay * 100);
    const base = Math.floor(cents / count);
    const months = Array.from({ length: count }, (_, index) => {
      const period = `${input.period.slice(0, 4)}-${String(firstMonth + index).padStart(2, '0')}`;
      const taxableIncome = (base + (index < cents % count ? 1 : 0)) / 100;
      const options = { ...input, period };
      const tax = calculateUgandaPaye(taxableIncome, options);
      return { period, taxableIncome, paye: tax.amount, scheduleLabel: tax.scheduleLabel, working: payeWorking(taxableIncome, options) };
    });
    calculation = { taxableIncome: input.taxablePay, paye: money(months.reduce((sum, month) => sum + month.paye, 0)), months, rules: UGANDA_PAYROLL_RULES };
  } else {
    const extras = money(input.allowances + input.bonus + input.overtime + input.otherEarnings);
    if (input.calculatorMode === 'gross') {
      calculation = grossUp(input);
      input.basicSalary = money(calculation.grossSalary - extras);
    } else {
      if (input.basicSalary + extras > MAX_AMOUNT) throw new RangeError('Total gross pay exceeds the supported limit.');
      calculation = monthlyCalculation(input, money(input.basicSalary + extras));
    }
  }
  return { success: true, employee, input, calculation };
}
