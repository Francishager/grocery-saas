import React, { useState, useEffect } from 'react';
import { HelpCircle, ChevronDown, ChevronRight, X, Search, Minimize2, Maximize2 } from 'lucide-react';
import { userGuideApi, type UserGuideStep } from '@/lib/api';

interface GuideSection {
  id: string;
  title: string;
  icon: string;
  description: string;
  topics: { label: string; detail: string }[];
}

const guideSections: GuideSection[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: '📊',
    description: 'Your business command center',
    topics: [
      { label: 'KPIs', detail: 'Key metrics like total sales, products, customers, and revenue shown as cards at the top.' },
      { label: 'Charts', detail: 'Visual trends for sales over time, top products, and category breakdowns.' },
      { label: 'Alerts', detail: 'Important notifications like low stock, overdue invoices, and pending tasks.' },
      { label: 'Recent Activity', detail: 'Latest transactions, sales, and updates across your business.' },
    ],
  },
  {
    id: 'inventory',
    title: 'Inventory Management',
    icon: '📦',
    description: 'Track products, services, and rentals',
    topics: [
      { label: 'Products', detail: 'Add, edit, and organize physical goods. Set SKU, barcode, price, cost, and stock quantity.' },
      { label: 'Services', detail: 'Create service items with estimated hours and duration. No stock tracking needed.' },
      { label: 'Rentals', detail: 'Track rental items with hire charges, deposits, and replacement values.' },
      { label: 'Categories', detail: 'Organize items into categories for easier management and reporting.' },
      { label: 'Stock Transfers', detail: 'Move inventory between branches. Track transfer status and quantities.' },
      { label: 'Multi-UOM', detail: 'Add selling units (e.g. Box, Carton, Dozen) with conversion factors for flexible pricing.' },
      { label: 'Low Stock Alerts', detail: 'Items below reorder level are flagged. Set minStock per product.' },
      { label: 'Bulk Import', detail: 'Import products from Excel. Go to Inventory > Import, upload your file with columns: name, price, cost, quantity, category, itemType.' },
    ],
  },
  {
    id: 'sales',
    title: 'Sales Management',
    icon: '💰',
    description: 'Record and track transactions',
    topics: [
      { label: 'Record a Sale', detail: 'Select products, enter quantities, choose payment method (cash, card, credit), and complete the transaction.' },
      { label: 'Multiple Payment Methods', detail: 'Accept cash, card, mobile money, or credit. Split payments supported.' },
      { label: 'Customer Tracking', detail: 'Attach sales to customers for purchase history and receivables tracking.' },
      { label: 'Receipts', detail: 'Print or email transaction receipts automatically after each sale.' },
      { label: 'Returns & Refunds', detail: 'Process returns and issue refunds. Stock is automatically adjusted.' },
      { label: 'Tax Configuration', detail: 'Set VAT/GST rates in Settings. Tax is auto-calculated on sales.' },
    ],
  },
  {
    id: 'accounting',
    title: 'Accounting',
    icon: '🧮',
    description: 'Financial management and bookkeeping',
    topics: [
      { label: 'Chart of Accounts', detail: 'View and manage your ledger accounts: assets, liabilities, equity, income, and expenses.' },
      { label: 'Journal Entries', detail: 'Record manual journal entries for adjustments and corrections.' },
      { label: 'Transaction Accounts', detail: 'Track bank, cash, and mobile money accounts with balances.' },
      { label: 'Expenses', detail: 'Record business expenses with categories and payment methods. Requires cash account assignment.' },
      { label: 'Tax Reports', detail: 'Generate VAT/GST reports for filing. Based on sales and purchase tax.' },
    ],
  },
  {
    id: 'receivables',
    title: 'Receivables',
    icon: '🧾',
    description: 'Track money owed to you',
    topics: [
      { label: 'Invoices', detail: 'Create and send invoices to customers. Track payment status.' },
      { label: 'Customer Aging', detail: 'See how long invoices have been outstanding. Identify overdue accounts.' },
      { label: 'Payment Recording', detail: 'Record partial or full payments against invoices.' },
      { label: 'Collection Reports', detail: 'Track collection efforts and outstanding balances.' },
    ],
  },
  {
    id: 'payables',
    title: 'Payables',
    icon: '📄',
    description: 'Track money you owe suppliers',
    topics: [
      { label: 'Bills', detail: 'Record supplier bills and track due dates.' },
      { label: 'Supplier Aging', detail: 'See how long bills have been outstanding.' },
      { label: 'Payment History', detail: 'Track all payments made to suppliers.' },
    ],
  },
  {
    id: 'reports',
    title: 'Reports & Analytics',
    icon: '📈',
    description: 'Understand your business performance',
    topics: [
      { label: 'Sales Reports', detail: 'Daily, weekly, monthly sales summaries with breakdowns by product, category, and branch.' },
      { label: 'Inventory Reports', detail: 'Stock movements, expiry tracking, damaged/lost stock, fast/slow moving products.' },
      { label: 'Financial Reports', detail: 'Profit & Loss, cash flow, trial balance, balance sheet, general ledger, tax reports.' },
      { label: 'Customer Reports', detail: 'Customer lists, sales by customer, balances, top customers.' },
      { label: 'Supplier Reports', detail: 'Supplier lists, purchases, payables, balances.' },
      { label: 'Performance Reports', detail: 'Branch, product, and category performance. User activity tracking.' },
    ],
  },
  {
    id: 'fuel',
    title: 'Fuel Station',
    icon: '⛽',
    description: 'Manage fuel pump operations',
    topics: [
      { label: 'Pump Management', detail: 'Track fuel pumps, nozzles, and readings. Record meter readings per shift.' },
      { label: 'Fuel Sales', detail: 'Record fuel sales by pump/nozzle. Auto-calculate volume and amount.' },
      { label: 'Shift Reports', detail: 'Generate shift reports reconciling pump readings with actual sales.' },
      { label: 'Tank Levels', detail: 'Monitor underground tank levels and schedule refills.' },
    ],
  },
  {
    id: 'restaurant',
    title: 'Restaurant',
    icon: '🍽️',
    description: 'Manage restaurant operations',
    topics: [
      { label: 'Orders', detail: 'Create and manage restaurant orders. Track order status from kitchen to table.' },
      { label: 'Recipes', detail: 'Define recipes with ingredients. Auto-deduct inventory when orders are completed.' },
      { label: 'Combo Meals', detail: 'Create combo meals bundling multiple items at a set price.' },
      { label: 'Production Orders', detail: 'Track kitchen production and waste for cost control.' },
    ],
  },
  {
    id: 'manufacturing',
    title: 'Manufacturing',
    icon: '🏭',
    description: 'Track production processes',
    topics: [
      { label: 'Production Orders', detail: 'Create production orders with input materials and output products.' },
      { label: 'Waste Tracking', detail: 'Record production waste to calculate true cost of goods manufactured.' },
      { label: 'Bill of Materials', detail: 'Define BOMs linking raw materials to finished products.' },
    ],
  },
  {
    id: 'agriculture',
    title: 'Agriculture',
    icon: '🌾',
    description: 'Manage farm operations',
    topics: [
      { label: 'Harvests', detail: 'Record harvest quantities, dates, and associated costs.' },
      { label: 'Crop Tracking', detail: 'Track planting, growth, and harvest cycles for each crop.' },
    ],
  },
  {
    id: 'service',
    title: 'Service Management',
    icon: '🔧',
    description: 'Track service appointments and work orders',
    topics: [
      { label: 'Appointments', detail: 'Schedule and manage service appointments with customers.' },
      { label: 'Work Orders', detail: 'Create work orders tracking service delivery from start to completion.' },
    ],
  },
  {
    id: 'staff',
    title: 'Staff & Roles',
    icon: '👥',
    description: 'Manage your team and permissions',
    topics: [
      { label: 'Add Staff', detail: 'Create staff team member accounts and share their login credentials. Staff members will log in using their email address and a one-time password (OTP), then set their own password during the account activation process.' },
      { label: 'Roles', detail: 'Assign roles: Owner, Manager, Accountant, Attendant. Each role has different permissions.' },
      { label: 'Granular Permissions', detail: 'Customize what each staff member can do: view, create, edit, delete per module.' },
      { label: 'Branch Assignment', detail: 'Assign staff to specific branches. They only see data for their assigned branch.' },
      { label: 'Activity Logs', detail: 'Track who did what and when for accountability.' },
    ],
  },
  {
    id: 'branches',
    title: 'Branches',
    icon: '🏢',
    description: 'Multi-location management',
    topics: [
      { label: 'Create Branches', detail: 'Add multiple business locations. Each branch has its own inventory and staff.' },
      { label: 'Branch Scope', detail: 'Staff see only their branch data. Owners can access all branches.' },
      { label: 'Stock Transfers', detail: 'Move inventory between branches with transfer tracking.' },
      { label: 'Branch Reports', detail: 'Compare performance across branches in Reports.' },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    icon: '⚙️',
    description: 'Configure your platform',
    topics: [
      { label: 'Tenant Settings', detail: 'Update business name, logo, contact info, and business type.' },
      { label: 'Tax Configuration', detail: 'Enable/disable tax, set VAT/GST rates, configure tax-inclusive pricing.' },
      { label: 'Payment Methods', detail: 'Configure accepted payment methods: cash, card, mobile money, credit.' },
      { label: 'Features', detail: 'Enable/disable modules based on your subscription plan.' },
      { label: 'Integrations', detail: 'Connect with external tools and services.' },
    ],
  },
  {
    id: 'subscription',
    title: 'Subscription & Plans',
    icon: '💎',
    description: 'Manage your subscription',
    topics: [
      { label: 'Plans', detail: 'Freemium, Starter, Growth, Professional, Enterprise — each with different features and limits.' },
      { label: 'Feature Access', detail: 'Upgrade to unlock more modules like Accounting, Fuel Station, Restaurant, etc.' },
      { label: 'Usage Limits', detail: 'Each plan has limits on products, staff, branches. Check usage in Settings.' },
      { label: 'Upgrade', detail: 'Upgrade anytime from Settings > Subscription. Changes take effect immediately.' },
    ],
  },
  {
    id: 'offline',
    title: 'Offline Mode',
    icon: '📴',
    description: 'Work without internet',
    topics: [
      { label: 'Offline Login', detail: 'If the server is unreachable, you can log in with a previously used account on the same device.' },
      { label: 'Offline Cache', detail: 'Recent data is cached locally so you can view inventory and sales history offline.' },
      { label: 'Auto-Sync', detail: 'When connection is restored, data automatically syncs back to the server.' },
    ],
  },
];

export default function UserGuideMenu() {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [apiSections, setApiSections] = useState<GuideSection[] | null>(null);

  useEffect(() => {
    let mounted = true;
    userGuideApi.grouped().then((data) => {
      if (!mounted || !data || Object.keys(data).length === 0) return;
      const sections: GuideSection[] = Object.entries(data).map(([category, steps]) => {
        const staticInfo = guideSections.find((s) => s.id === category);
        return {
          id: category,
          title: staticInfo?.title || category.charAt(0).toUpperCase() + category.slice(1),
          icon: staticInfo?.icon || '📋',
          description: staticInfo?.description || '',
          topics: steps
            .sort((a, b) => a.stepNumber - b.stepNumber)
            .map((s: UserGuideStep) => ({
              label: s.title,
              detail: s.description,
              imageUrl: s.imageUrl || undefined,
            })),
        };
      });
      setApiSections(sections);
    }).catch(() => {});
    return () => { mounted = false };
  }, []);

  const activeSections = apiSections || guideSections;

  const filteredSections = searchQuery
    ? activeSections.filter(
        (s) =>
          s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.topics.some((t) => t.label.toLowerCase().includes(searchQuery.toLowerCase()) || t.detail.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : activeSections;

  const toggleSection = (id: string) => {
    setExpandedSection(expandedSection === id ? null : id);
  };

  return (
    <>
      {/* Sidebar card */}
      <div className="border-t border-gray-200 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-4 mx-3 mb-3">
        <button
          onClick={() => setIsModalOpen(true)}
          className="w-full flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 rounded-full p-2">
              <HelpCircle className="w-4 h-4 text-white" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold text-gray-900 text-sm">User Guide</h3>
              <p className="text-xs text-gray-500">Learn how everything works</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Full guide — slide-in panel from right */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          {!isMinimized && (
            <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setIsModalOpen(false)} />
          )}

          {/* Panel */}
          <div
            className={`absolute right-0 top-0 h-full bg-white shadow-2xl flex flex-col transition-all duration-300 ease-in-out ${
              isMinimized
                ? 'w-full sm:w-[420px] max-h-[60px] bottom-0 top-auto rounded-t-lg'
                : 'w-full sm:w-[680px] lg:w-[850px]'
            }`}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-5 py-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <HelpCircle className="w-5 h-5 flex-shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-lg font-bold truncate">JibuSales User Guide</h2>
                  {!isMinimized && (
                    <p className="text-xs text-indigo-100 truncate">Everything you need to know about each feature</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="text-white hover:bg-white/20 rounded-full p-2 transition"
                  title={isMinimized ? 'Expand' : 'Minimize'}
                >
                  {isMinimized ? <Maximize2 className="w-5 h-5" /> : <Minimize2 className="w-5 h-5" />}
                </button>
                <button
                  onClick={() => { setIsModalOpen(false); setIsMinimized(false); }}
                  className="text-white hover:bg-white/20 rounded-full p-2 transition"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Search + Content (hidden when minimized) */}
            {!isMinimized && (
              <>
                {/* Search */}
                <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 flex-shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search features..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-400"
                    />
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-2">
                  {filteredSections.length === 0 && (
                    <p className="text-center text-gray-500 py-8">No results found for "{searchQuery}"</p>
                  )}
                  {filteredSections.map((section) => (
                    <div key={section.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleSection(section.id)}
                        className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition text-left"
                      >
                        <span className="text-2xl flex-shrink-0">{section.icon}</span>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900">{section.title}</h3>
                          <p className="text-sm text-gray-500 truncate">{section.description}</p>
                        </div>
                        {expandedSection === section.id ? (
                          <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        )}
                      </button>
                      {expandedSection === section.id && (
                        <div className="border-t border-gray-200 bg-gray-50 p-4 space-y-3">
                          {section.topics.map((topic, idx) => (
                            <div key={idx} className="flex gap-3">
                              <div className="flex-shrink-0 w-2 h-2 bg-indigo-500 rounded-full mt-1.5" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm text-gray-900">{topic.label}</p>
                                <p className="text-sm text-gray-600">{topic.detail}</p>
                                {(topic as any).imageUrl && (
                                  <img src={(topic as any).imageUrl} alt={topic.label} className="mt-2 rounded-lg border border-gray-200 w-full max-w-2xl" />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="bg-gray-50 border-t border-gray-200 px-5 py-3 flex items-center justify-between flex-shrink-0">
                  <span className="text-sm text-gray-500">{filteredSections.length} sections{apiSections && ' (managed)'}</span>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition text-sm font-medium"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
