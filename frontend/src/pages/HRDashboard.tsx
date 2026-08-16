import React, { useState, useEffect } from "react";
import {
  Users,
  DollarSign,
  AlertCircle,
  TrendingUp,
  Zap,
  Clock,
  CheckCircle2,
} from "lucide-react";
import axios from "axios";

export default function HRDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, [selectedBranch]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const params = selectedBranch ? { branchId: selectedBranch } : {};
      const response = await axios.get("/api/hr/dashboard", { params });
      setDashboard(response.data);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="p-4 bg-red-50 border border-red-300 rounded-lg flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-900 font-semibold">Error</p>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const {
    employees,
    payroll,
    salaryAdvances,
  } = dashboard || {};

  // Helper to format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-UG", {
      style: "currency",
      currency: "UGX",
      minimumFractionDigits: 0,
    }).format(amount || 0);
  };

  // Helper for card styling
  const StatCard = ({ icon: Icon, label, value, subtext, color = "blue" }) => {
    const colorClasses = {
      blue: "bg-blue-50 border-blue-200 text-blue-900 text-blue-700",
      green: "bg-green-50 border-green-200 text-green-900 text-green-700",
      yellow: "bg-yellow-50 border-yellow-200 text-yellow-900 text-yellow-700",
      red: "bg-red-50 border-red-200 text-red-900 text-red-700",
    };

    return (
      <div className={`rounded-lg border-2 p-6 ${colorClasses[color]}`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium opacity-75">{label}</p>
            <p className="text-3xl font-bold mt-2">{value}</p>
            {subtext && <p className="text-xs mt-2 opacity-75">{subtext}</p>}
          </div>
          <Icon className="h-8 w-8 opacity-50" />
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 flex items-center gap-3">
          <Zap className="h-10 w-10" />
          HR Dashboard
        </h1>
        <p className="text-gray-600 mt-2">
          Current payroll and salary management metrics for {payroll?.period}
        </p>
      </div>

      {/* Employee Section */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Employees</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatCard
            icon={Users}
            label="Total Employees"
            value={employees?.total || 0}
            color="blue"
          />
        </div>
      </div>

      {/* Payroll Section */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Payroll ({payroll?.period})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            icon={Clock}
            label="Payroll Records"
            value={payroll?.total || 0}
            subtext={`${payroll?.pending} Pending | ${payroll?.approved} Approved`}
            color="blue"
          />
          <StatCard
            icon={AlertCircle}
            label="Salary Payable"
            value={formatCurrency(payroll?.salaryPayable)}
            subtext="Awaiting payment"
            color="yellow"
          />
          <StatCard
            icon={CheckCircle2}
            label="Salary Paid"
            value={formatCurrency(payroll?.salaryPaid)}
            subtext="Already distributed"
            color="green"
          />
          <StatCard
            icon={TrendingUp}
            label="Gross Salary"
            value={formatCurrency(payroll?.salaryPayable + payroll?.salaryPaid)}
            subtext="Total expense"
            color="blue"
          />
        </div>
      </div>

      {/* Salary Advances Section */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Salary Advances</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            icon={DollarSign}
            label="Total Issued"
            value={formatCurrency(salaryAdvances?.totalIssued)}
            subtext={`${salaryAdvances?.activeAdvances} active`}
            color="blue"
          />
          <StatCard
            icon={TrendingUp}
            label="Total Recovered"
            value={formatCurrency(salaryAdvances?.totalRecovered)}
            subtext="Through payroll & repayment"
            color="green"
          />
          <StatCard
            icon={AlertCircle}
            label="Outstanding"
            value={formatCurrency(salaryAdvances?.totalOutstanding)}
            subtext={`${salaryAdvances?.employeesWithAdvances} employees`}
            color="red"
          />
          <StatCard
            icon={Zap}
            label="Issued This Month"
            value={salaryAdvances?.issuedThisMonth || 0}
            subtext="New advances"
            color="yellow"
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <a
            href="/hr/salary-advances"
            className="px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition text-center font-medium"
          >
            Issue Salary Advance
          </a>
          <a
            href="/hr/payroll"
            className="px-4 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition text-center font-medium"
          >
            Create Payroll
          </a>
          <a
            href="/hr/config"
            className="px-4 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition text-center font-medium"
          >
            HR Settings
          </a>
        </div>
      </div>

      {/* Info Card */}
      <div className="mt-8 p-4 bg-blue-50 border border-blue-300 rounded-lg">
        <p className="text-blue-900 text-sm">
          <span className="font-semibold">💡 Tip:</span> All salary advances and
          payroll transactions are automatically integrated with your accounting system.
          Check the General Ledger for detailed transaction records.
        </p>
      </div>
    </div>
  );
}
