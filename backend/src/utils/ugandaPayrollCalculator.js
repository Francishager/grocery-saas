const JULY_2026_PAYE_PERIOD = "2026-07";

export const UGANDA_PAYROLL_RULES = {
  country: "Uganda",
  currency: "UGX",
  paye: {
    taxableBasis: "Monthly employment income",
    residentPreJuly2026:
      "0 up to 235,000; 10% from 235,001-335,000; 10,000 + 20% from 335,001-410,000; 25,000 + 30% above 410,000; extra 10% above 10,000,000.",
    residentFromJuly2026:
      "0 up to 335,000; 20% from 335,001-410,000; 15,000 + 25% from 410,001-485,000; 33,750 + 30% above 485,000; extra 10% above 10,000,000.",
    nonResident:
      "10% up to 335,000; 33,500 + 20% from 335,001-410,000; 48,500 + 30% above 410,000; extra 10% above 10,000,000.",
    multipleEmployment: "30% of monthly employment income.",
  },
  socialSecurity: {
    employeeRate: 0.05,
    employerRate: 0.1,
    basis: "Gross monthly salary",
  },
};

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function periodStartsFromJuly2026(period) {
  return String(period || "") >= JULY_2026_PAYE_PERIOD;
}

export function calculateUgandaResidentPaye(monthlyTaxableIncome = 0, period = "") {
  const income = Math.max(0, Number(monthlyTaxableIncome || 0));

  if (periodStartsFromJuly2026(period)) {
    if (income <= 335000) return 0;
    if (income <= 410000) return roundMoney((income - 335000) * 0.2);
    if (income <= 485000) return roundMoney(15000 + (income - 410000) * 0.25);
    if (income <= 10000000) return roundMoney(33750 + (income - 485000) * 0.3);
    return roundMoney(33750 + (income - 485000) * 0.3 + (income - 10000000) * 0.1);
  }

  if (income <= 235000) return 0;
  if (income <= 335000) return roundMoney((income - 235000) * 0.1);
  if (income <= 410000) return roundMoney(10000 + (income - 335000) * 0.2);
  if (income <= 10000000) return roundMoney(25000 + (income - 410000) * 0.3);
  return roundMoney(25000 + (income - 410000) * 0.3 + (income - 10000000) * 0.1);
}

export function calculateUgandaNonResidentPaye(monthlyTaxableIncome = 0) {
  const income = Math.max(0, Number(monthlyTaxableIncome || 0));

  if (income <= 335000) return roundMoney(income * 0.1);
  if (income <= 410000) return roundMoney(33500 + (income - 335000) * 0.2);
  if (income <= 10000000) return roundMoney(48500 + (income - 410000) * 0.3);
  return roundMoney(48500 + (income - 410000) * 0.3 + (income - 10000000) * 0.1);
}

export function calculateUgandaPaye(monthlyTaxableIncome = 0, options = {}) {
  const income = Math.max(0, Number(monthlyTaxableIncome || 0));
  const residencyStatus = String(options.residencyStatus || "resident").toLowerCase();
  const multipleEmployment = Boolean(options.multipleEmployment);

  if (multipleEmployment) {
    return {
      amount: roundMoney(income * 0.3),
      schedule: "UGANDA_MULTIPLE_EMPLOYMENT_FLAT_30",
      scheduleLabel: "Multiple employment PAYE",
    };
  }

  if (residencyStatus === "non_resident" || residencyStatus === "non-resident") {
    return {
      amount: calculateUgandaNonResidentPaye(income),
      schedule: "UGANDA_NON_RESIDENT",
      scheduleLabel: "Non-resident PAYE",
    };
  }

  return {
    amount: calculateUgandaResidentPaye(income, options.period),
    schedule: periodStartsFromJuly2026(options.period)
      ? "UGANDA_RESIDENT_FROM_2026_07"
      : "UGANDA_RESIDENT_PRE_2026_07",
    scheduleLabel: periodStartsFromJuly2026(options.period)
      ? "Resident PAYE from Jul 2026"
      : "Resident PAYE up to Jun 2026",
  };
}

export function calculateUgandaPayrollDeductions({
  period = "",
  basicSalary = 0,
  allowances = 0,
  bonus = 0,
  overtime = 0,
  otherEarnings = 0,
  hasTin = false,
  hasSocialSecurityNumber = false,
  taxEnabled,
  socialSecurityEnabled,
  residencyStatus = "resident",
  multipleEmployment = false,
  healthInsurance = 0,
  otherDeductions = 0,
  salaryAdvanceRecovery = 0,
} = {}) {
  const grossSalary = roundMoney(
    Number(basicSalary || 0) +
      Number(allowances || 0) +
      Number(bonus || 0) +
      Number(overtime || 0) +
      Number(otherEarnings || 0)
  );
  const shouldCalculateTax = taxEnabled === undefined ? hasTin : Boolean(taxEnabled);
  const shouldCalculateSocialSecurity =
    socialSecurityEnabled === undefined ? hasSocialSecurityNumber : Boolean(socialSecurityEnabled);
  const payeBreakdown = calculateUgandaPaye(grossSalary, {
    period,
    residencyStatus,
    multipleEmployment,
  });
  const paye = shouldCalculateTax ? payeBreakdown.amount : 0;
  const employeeSocialSecurity = shouldCalculateSocialSecurity
    ? roundMoney(grossSalary * UGANDA_PAYROLL_RULES.socialSecurity.employeeRate)
    : 0;
  const employerSocialSecurity = shouldCalculateSocialSecurity
    ? roundMoney(grossSalary * UGANDA_PAYROLL_RULES.socialSecurity.employerRate)
    : 0;
  const manualDeductions = roundMoney(
    Number(healthInsurance || 0) +
      Number(otherDeductions || 0) +
      Number(salaryAdvanceRecovery || 0)
  );
  const employeeStatutoryDeductions = roundMoney(paye + employeeSocialSecurity);
  const totalDeductions = roundMoney(employeeStatutoryDeductions + manualDeductions);

  return {
    grossSalary,
    taxableIncome: grossSalary,
    paye,
    payeSchedule: shouldCalculateTax ? payeBreakdown.schedule : "PAYE_NOT_APPLIED",
    payeScheduleLabel: shouldCalculateTax ? payeBreakdown.scheduleLabel : "PAYE not applied",
    employeeSocialSecurity,
    employerSocialSecurity,
    totalSocialSecurity: roundMoney(employeeSocialSecurity + employerSocialSecurity),
    employeeStatutoryDeductions,
    manualDeductions,
    totalDeductions,
    netSalary: Math.max(0, roundMoney(grossSalary - totalDeductions)),
    employerCost: roundMoney(grossSalary + employerSocialSecurity),
    rules: UGANDA_PAYROLL_RULES,
  };
}
