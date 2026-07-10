import React, { useState } from 'react';
import { X, ArrowRight, Check, BookOpen } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export default function OnboardingGuideModal({
  isOpen,
  onClose,
  onComplete,
}: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: '👋 Welcome to jibuSales',
      description: 'Your all-in-one business management platform',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700">
            jibuSales helps you manage your business across operations, inventory, sales, reporting, and finance in one place.
          </p>
          <p className="text-gray-700">
            Whether you run a retail, service, distribution, or multi-branch operation, this guide will help you get started quickly.
          </p>
        </div>
      ),
    },
    {
      title: '📊 Dashboard',
      description: 'Your business at a glance',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700">
            The Dashboard is your command center with real-time insights:
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li><strong>KPIs</strong> - Key metrics like total sales, products, customers</li>
            <li><strong>Charts</strong> - Visual trends over time</li>
            <li><strong>Alerts</strong> - Important notifications at a glance</li>
            <li><strong>Recent Activity</strong> - Latest transactions and updates</li>
          </ul>
          <p className="text-sm bg-blue-50 border border-blue-200 rounded p-2 text-blue-700">
            💡 Tip: Check the dashboard first when you log in to see business health
          </p>
        </div>
      ),
    },
    {
      title: '📦 Inventory Management',
      description: 'Track products and stock',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700">
            Manage your products and keep track of stock levels:
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li><strong>Products</strong> - Add, edit, and organize items</li>
            <li><strong>Categories</strong> - Organize products by type</li>
            <li><strong>Stock Levels</strong> - Monitor inventory in real-time</li>
            <li><strong>Reorder Points</strong> - Get alerts when stock is low</li>
            <li><strong>Stock Transfers</strong> - Move inventory between branches</li>
          </ul>
          <p className="text-sm bg-blue-50 border border-blue-200 rounded p-2 text-blue-700">
            💡 Tip: Regularly update stock to keep accurate records
          </p>
        </div>
      ),
    },
    {
      title: '💰 Sales Management',
      description: 'Record and track transactions',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700">
            Record every transaction and manage sales data:
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li><strong>Record Sales</strong> - Log customer transactions</li>
            <li><strong>Multiple Payment Methods</strong> - Cash, card, credit</li>
            <li><strong>Customer Tracking</strong> - Monitor buyer behavior</li>
            <li><strong>Receipts</strong> - Print or email transaction receipts</li>
            <li><strong>Returns</strong> - Process returns and refunds</li>
          </ul>
          <p className="text-sm bg-blue-50 border border-blue-200 rounded p-2 text-blue-700">
            💡 Tip: Accurate sales data helps with inventory and financial planning
          </p>
        </div>
      ),
    },
    {
      title: '📈 Reports & Analytics',
      description: 'Understand your business',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700">
            Make informed decisions with detailed reports:
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li><strong>Sales Reports</strong> - Daily, weekly, monthly summaries</li>
            <li><strong>Inventory Reports</strong> - Stock movements and levels</li>
            <li><strong>Financial Reports</strong> - Profit, costs, revenue tracking</li>
            <li><strong>Customer Reports</strong> - Top buyers, purchase patterns</li>
            <li><strong>Custom Reports</strong> - Filter and export data as needed</li>
          </ul>
          <p className="text-sm bg-blue-50 border border-blue-200 rounded p-2 text-blue-700">
            💡 Tip: Review reports weekly to identify trends and opportunities
          </p>
        </div>
      ),
    },
    {
      title: '⚙️ Settings & Configuration',
      description: 'Customize your platform',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700">
            Configure the platform to match your business:
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li><strong>Tenant Settings</strong> - Company info and preferences</li>
            <li><strong>Branches</strong> - Multiple location management</li>
            <li><strong>User Accounts</strong> - Add staff and assign roles</li>
            <li><strong>Features</strong> - Enable/disable modules based on plan</li>
            <li><strong>Integrations</strong> - Connect with external tools</li>
          </ul>
          <p className="text-sm bg-blue-50 border border-blue-200 rounded p-2 text-blue-700">
            💡 Tip: Invite team members early so they can start using the platform
          </p>
        </div>
      ),
    },
    {
      title: '👥 User Management',
      description: 'Build your team',
      content: (
        <div className="space-y-4">
          <p className="text-gray-700">
            Manage who can access what:
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li><strong>Create Accounts</strong> - Add staff members</li>
            <li><strong>Assign Roles</strong> - Owner, manager, staff, attendant</li>
            <li><strong>Permissions</strong> - Control what each role can do</li>
            <li><strong>Activity Logs</strong> - Track who did what</li>
            <li><strong>Branch Assignment</strong> - Assign users to locations</li>
          </ul>
          <p className="text-sm bg-blue-50 border border-blue-200 rounded p-2 text-blue-700">
            💡 Tip: Clearly define roles to maintain data security and accountability
          </p>
        </div>
      ),
    },
    {
      title: '🎯 Next Steps',
      description: "You're all set! Here's what to do first:",
      content: (
        <div className="space-y-4">
          <ol className="list-decimal list-inside space-y-3 text-gray-700">
            <li><strong>Visit the Dashboard</strong> - See your current business metrics</li>
            <li><strong>Add Products</strong> - Start building your inventory</li>
            <li><strong>Invite Staff</strong> - Add team members with appropriate roles</li>
            <li><strong>Record a Sale</strong> - Get familiar with the sales process</li>
            <li><strong>Review Reports</strong> - Understand your business data</li>
            <li><strong>Explore Features</strong> - Discover tools relevant to your needs</li>
          </ol>
          <p className="text-sm bg-green-50 border border-green-200 rounded p-2 text-green-700 font-semibold">
            ✅ You can always access this guide from the sidebar for reference!
          </p>
        </div>
      ),
    },
  ];

  const currentStepData = steps[currentStep];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6" />
            <h2 className="text-2xl font-bold">Getting Started Guide</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-blue-600 rounded-full p-2 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Progress indicator */}
        <div className="bg-gray-100 px-6 py-3 flex items-center gap-2">
          <span className="text-sm text-gray-600">
            Step <strong>{currentStep + 1}</strong> of <strong>{steps.length}</strong>
          </span>
          <div className="flex-1 bg-gray-300 rounded-full h-2 ml-2">
            <div
              className="bg-blue-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            ></div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <h3 className="text-2xl font-bold text-gray-900 mb-2">
            {currentStepData.title}
          </h3>
          <p className="text-gray-500 mb-4">{currentStepData.description}</p>
          <div className="text-gray-700">{currentStepData.content}</div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => onClose()}
            className="text-gray-600 hover:text-gray-900 font-medium transition"
          >
            Skip Guide
          </button>

          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                onClick={() => setCurrentStep(currentStep - 1)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
              >
                Back
              </button>
            )}

            {currentStep < steps.length - 1 ? (
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => {
                  onComplete();
                  onClose();
                }}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center gap-2"
              >
                Complete <Check className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
