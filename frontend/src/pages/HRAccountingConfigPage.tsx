import React, { useState, useEffect } from "react";
import { AlertCircle, CheckCircle2, Settings, Zap } from "lucide-react";
import axios from "axios";

export default function HRAccountingConfigPage() {
  const [config, setConfig] = useState(null);
  const [availableAccounts, setAvailableAccounts] = useState(null);
  const [selectedAccounts, setSelectedAccounts] = useState({
    salaryExpenseAccountId: "",
    salaryPayableAccountId: "",
    salaryAdvanceAccountId: "",
    payeTaxAccountId: "",
    socialSecurityAccountId: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showInitialize, setShowInitialize] = useState(false);

  // Fetch current configuration and available accounts
  useEffect(() => {
    fetchConfiguration();
  }, []);

  const fetchConfiguration = async () => {
    try {
      setLoading(true);
      const [configRes, accountsRes] = await Promise.all([
        axios.get("/api/hr/config"),
        axios.get("/api/hr/config/available-accounts"),
      ]);

      setConfig(configRes.data.config);
      setAvailableAccounts(accountsRes.data);
      setSelectedAccounts({
        salaryExpenseAccountId: configRes.data.config.salaryExpenseAccountId || "",
        salaryPayableAccountId: configRes.data.config.salaryPayableAccountId || "",
        salaryAdvanceAccountId: configRes.data.config.salaryAdvanceAccountId || "",
        payeTaxAccountId: configRes.data.config.payeTaxAccountId || "",
        socialSecurityAccountId: configRes.data.config.socialSecurityAccountId || "",
      });
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load configuration");
    } finally {
      setLoading(false);
    }
  };

  const handleAccountChange = (field, value) => {
    setSelectedAccounts((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveMapping = async () => {
    try {
      setSaving(true);
      const response = await axios.post("/api/hr/config/mapping", selectedAccounts);

      setConfig(response.data.config);
      setSuccess("HR account mapping updated successfully!");
      setTimeout(() => setSuccess(null), 3000);
      setError(null);
    } catch (err) {
      const errorMsg = err.response?.data?.error || "Failed to save mapping";
      setError(errorMsg);
      console.error("Validation errors:", err.response?.data?.validation);
    } finally {
      setSaving(false);
    }
  };

  const handleInitializeAccounts = async () => {
    try {
      setSaving(true);
      const response = await axios.post("/api/hr/config/initialize-accounts", {
        branchId: localStorage.getItem("selectedBranchId"), // From app state
      });

      setConfig(response.data.config);
      setShowInitialize(false);
      setSuccess(
        "Default HR accounts created! Please review and confirm the mappings."
      );
      await fetchConfiguration(); // Refresh after creation
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "Failed to initialize accounts. They may already exist."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const isConfigured =
    config?.salaryExpenseAccountId &&
    config?.salaryPayableAccountId &&
    config?.salaryAdvanceAccountId;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="h-8 w-8" />
          HR Accounting Configuration
        </h1>
        <p className="text-gray-600 mt-2">
          Set up accounting accounts for HR transactions (salary advances, payroll,
          payments)
        </p>
      </div>

      {/* Status Card */}
      <div className="mb-6 p-4 rounded-lg border-2 flex items-center gap-4" 
           style={{ borderColor: isConfigured ? "#10b981" : "#f59e0b" ,
                    backgroundColor: isConfigured ? "#ecfdf5" : "#fffbeb" }}>
        {isConfigured ? (
          <CheckCircle2 className="h-8 w-8 text-green-600 flex-shrink-0" />
        ) : (
          <AlertCircle className="h-8 w-8 text-yellow-600 flex-shrink-0" />
        )}
        <div>
          <p className="font-semibold text-gray-900">
            {isConfigured
              ? "HR Accounting is Configured"
              : "HR Accounting Needs Setup"}
          </p>
          <p className="text-gray-600 text-sm">
            {isConfigured
              ? "All required accounts are mapped. HR features are ready to use."
              : "Configure accounting accounts before using salary advances or payroll."}
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-300 rounded-lg flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-900 font-semibold">Error</p>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-300 rounded-lg flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-green-800">{success}</p>
        </div>
      )}

      {/* Account Mapping Form */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Account Mappings
        </h2>

        <div className="space-y-4">
          {/* Salary Expense Account */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Salary Expense Account *
              <span className="text-gray-500 text-xs font-normal">
                (Expense) - Recognized when payroll is posted
              </span>
            </label>
            <select
              value={selectedAccounts.salaryExpenseAccountId}
              onChange={(e) =>
                handleAccountChange("salaryExpenseAccountId", e.target.value)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">-- Select Account --</option>
              {availableAccounts?.expenseAccounts?.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.code} - {acc.name}
                </option>
              ))}
            </select>
            {selectedAccounts.salaryExpenseAccountId && (
              <p className="text-xs text-green-600 mt-1">✓ Selected</p>
            )}
          </div>

          {/* Salary Payable Account */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Salary Payable Account *
              <span className="text-gray-500 text-xs font-normal">
                (Liability) - Amount owed to employees
              </span>
            </label>
            <select
              value={selectedAccounts.salaryPayableAccountId}
              onChange={(e) =>
                handleAccountChange("salaryPayableAccountId", e.target.value)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">-- Select Account --</option>
              {availableAccounts?.liabilityAccounts?.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.code} - {acc.name}
                </option>
              ))}
            </select>
            {selectedAccounts.salaryPayableAccountId && (
              <p className="text-xs text-green-600 mt-1">✓ Selected</p>
            )}
          </div>

          {/* Salary Advance Account */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Salary Advance Account *
              <span className="text-gray-500 text-xs font-normal">
                (Asset/Receivable) - Money advanced to employees
              </span>
            </label>
            <select
              value={selectedAccounts.salaryAdvanceAccountId}
              onChange={(e) =>
                handleAccountChange("salaryAdvanceAccountId", e.target.value)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">-- Select Account --</option>
              {availableAccounts?.assetAccounts?.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.code} - {acc.name}
                </option>
              ))}
            </select>
            {selectedAccounts.salaryAdvanceAccountId && (
              <p className="text-xs text-green-600 mt-1">✓ Selected</p>
            )}
          </div>

          {/* PAYE Tax Account (Optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              PAYE Tax Account
              <span className="text-gray-500 text-xs font-normal">
                (Optional) - Tax liability tracking
              </span>
            </label>
            <select
              value={selectedAccounts.payeTaxAccountId}
              onChange={(e) =>
                handleAccountChange("payeTaxAccountId", e.target.value)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">-- Select Account (Optional) --</option>
              {availableAccounts?.liabilityAccounts?.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.code} - {acc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Social Security Account (Optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Social Security Account
              <span className="text-gray-500 text-xs font-normal">
                (Optional) - SS liability tracking
              </span>
            </label>
            <select
              value={selectedAccounts.socialSecurityAccountId}
              onChange={(e) =>
                handleAccountChange("socialSecurityAccountId", e.target.value)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">-- Select Account (Optional) --</option>
              {availableAccounts?.liabilityAccounts?.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.code} - {acc.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleSaveMapping}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition"
          >
            {saving ? "Saving..." : "Save Mapping"}
          </button>

          {!isConfigured && (
            <button
              onClick={() => setShowInitialize(!showInitialize)}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition"
            >
              Auto-Create Default Accounts
            </button>
          )}
        </div>

        {showInitialize && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-300 rounded-md">
            <p className="text-blue-900 mb-3">
              This will create default HR accounts (Salaries & Wages, Salaries Payable,
              Employee Salary Advances) and automatically map them.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleInitializeAccounts}
                disabled={saving}
                className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:bg-gray-400 transition"
              >
                {saving ? "Creating..." : "Create Default Accounts"}
              </button>
              <button
                onClick={() => setShowInitialize(false)}
                className="px-3 py-2 bg-gray-300 text-gray-900 rounded-md text-sm hover:bg-gray-400 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Account Type Guide */}
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
        <h3 className="font-semibold text-blue-900 mb-3">Account Type Guide</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="font-medium text-blue-900">Salary Expense</p>
            <p className="text-blue-700 text-xs mt-1">
              Must be "Expense" type. Increased when payroll is posted.
            </p>
          </div>
          <div>
            <p className="font-medium text-blue-900">Salary Payable</p>
            <p className="text-blue-700 text-xs mt-1">
              Must be "Liability" type. Decreased when salary is paid.
            </p>
          </div>
          <div>
            <p className="font-medium text-blue-900">Salary Advance</p>
            <p className="text-blue-700 text-xs mt-1">
              Must be "Asset" type. Decreased when advances are recovered.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
