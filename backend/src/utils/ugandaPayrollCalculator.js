const JULY_2026_PAYE_PERIOD = "2026-07";

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

export function calculateUgandaPayrollDeductions({
  period = "",
  basicSalary = 0,
  allowances = 0,
  bonus = 0,
  overtime = 0,
  otherEarnings = 0,
  hasTin = false,
  hasSocialSecurityNumber = false,
} = {}) {
  const grossSalary = roundMoney(
    Number(basicSalary || 0) +
      Number(allowances || 0) +
      Number(bonus || 0) +
      Number(overtime || 0) +
      Number(otherEarnings || 0)
  );
  const paye = hasTin ? calculateUgandaResidentPaye(grossSalary, period) : 0;
  const employeeSocialSecurity = hasSocialSecurityNumber ? roundMoney(grossSalary * 0.05) : 0;
  const employerSocialSecurity = hasSocialSecurityNumber ? roundMoney(grossSalary * 0.1) : 0;

  return {
    grossSalary,
    taxableIncome: grossSalary,
    paye,
    employeeSocialSecurity,
    employerSocialSecurity,
    totalSocialSecurity: roundMoney(employeeSocialSecurity + employerSocialSecurity),
    employeeStatutoryDeductions: roundMoney(paye + employeeSocialSecurity),
    payeSchedule: periodStartsFromJuly2026(period) ? "UGANDA_RESIDENT_FROM_2026_07" : "UGANDA_RESIDENT_PRE_2026_07",
  };
}
