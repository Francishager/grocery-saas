import { useState } from 'react'
import { Factory, Beaker, ClipboardCheck, Package, AlertTriangle, TrendingDown, Calendar, DollarSign, Boxes, ArrowRight, CheckCircle2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface GuideStep {
  title: string
  description: string
  details?: string[]
  icon: typeof Factory
}

interface GuideSection {
  id: string
  label: string
  icon: typeof Factory
  color: string
  steps: GuideStep[]
}

const sections: GuideSection[] = [
  {
    id: 'setup',
    label: '1. Setup & Prerequisites',
    icon: Boxes,
    color: 'bg-blue-500',
    steps: [
      {
        title: 'Set Business Type to Manufacturing',
        description: 'The tenant must have their business type set to "manufacturing_company" to unlock the manufacturing module.',
        details: [
          'Go to Tenant Settings → Business Profile',
          'Select "Manufacturing Company" as the business type',
          'This automatically enables the manufacturing feature flag',
          'The Manufacturing menu item appears in the tenant sidebar',
        ],
        icon: Boxes,
      },
      {
        title: 'Verify Permissions',
        description: 'Ensure the right staff roles have manufacturing permissions enabled.',
        details: [
          'canViewManufacturing — view production orders, BOMs, waste, QC, batches',
          'canCreateManufacturing — create orders, BOMs, waste records, QC checks, batches',
          'canEditManufacturing — update order status, edit BOMs, update QC and batch status',
          'canDeleteManufacturing — delete production orders',
        ],
        icon: CheckCircle2,
      },
      {
        title: 'Add Raw Materials to Inventory',
        description: 'All ingredients and raw materials must exist as inventory products before creating BOMs.',
        details: [
          'Go to Inventory → Products → Add Product',
          'Create products for each raw material (e.g., Maize Grains, Packaging Bags)',
          'Set the cost price — this is used for automatic standard cost calculation',
          'Set the base unit (KG, Litre, Piece, etc.) for accurate quantity tracking',
        ],
        icon: Package,
      },
      {
        title: 'Add Finished Goods to Inventory',
        description: 'Create inventory items for the products you manufacture.',
        details: [
          'Create a product for each finished good (e.g., "Maize Flour 1kg Pack")',
          'Set the selling price — this is what customers pay',
          'Set initial quantity to 0 — stock increases automatically when production completes',
          'The same product can be both a finished good and a raw material (sub-assembly)',
        ],
        icon: Factory,
      },
    ],
  },
  {
    id: 'bom',
    label: '2. Bill of Materials (BOM) / Recipes',
    icon: Beaker,
    color: 'bg-purple-500',
    steps: [
      {
        title: 'Create a BOM / Recipe',
        description: 'A BOM defines what ingredients are needed to produce a finished good.',
        details: [
          'Go to Manufacturing → BOM tab → Click "Add BOM / Recipe"',
          'Select the finished product from the dropdown',
          'Give the recipe a name (e.g., "Maize Flour Standard Recipe")',
          'Specify the yield (e.g., "100 kg of flour per batch")',
        ],
        icon: Beaker,
      },
      {
        title: 'Add Ingredients to the BOM',
        description: 'List every raw material needed and the quantity per batch.',
        details: [
          'Click "Add ingredient" for each raw material',
          'Select the ingredient product from the dropdown',
          'Enter the quantity needed per batch (e.g., 120 KG of maize grains)',
          'Specify the unit of measure (KG, Litre, Piece, etc.)',
          'The system detects sub-assemblies automatically — if an ingredient itself has a BOM, it will be expanded during production',
        ],
        icon: Beaker,
      },
      {
        title: 'Multi-Level BOM Support',
        description: 'The system supports nested BOMs for complex manufacturing processes.',
        details: [
          'If ingredient A is itself a manufactured product with its own BOM, the system recursively expands it',
          'Example: "Packaged Flour" BOM includes "Milled Flour" (which has its own BOM of maize grains)',
          'On production completion, all leaf-level raw materials are deducted from stock',
          'Use the BOM Cost Preview endpoint to see the fully exploded cost breakdown',
        ],
        icon: Boxes,
      },
    ],
  },
  {
    id: 'order',
    label: '3. Production Orders',
    icon: Factory,
    color: 'bg-green-500',
    steps: [
      {
        title: 'Create a Production Order',
        description: 'A production order initiates the manufacturing process for a specific quantity.',
        details: [
          'Go to Manufacturing → Production Orders → Click "New Production Order"',
          'Select the finished product to manufacture',
          'Optionally link a BOM/Recipe — this enables automatic ingredient deduction on completion',
          'Enter the planned quantity to produce',
          'Enter the unit material cost (cost per unit of finished good)',
          'Enter labor cost and overhead cost for accurate total costing',
          'Optionally set a batch number (e.g., BATCH-2024-001)',
          'Set expected yield if different from planned quantity',
          'Set planned start and end dates for production scheduling',
        ],
        icon: Factory,
      },
      {
        title: 'Standard Cost Auto-Calculation',
        description: 'When a BOM is linked, the system automatically calculates the standard cost.',
        details: [
          'Standard cost = sum of all ingredient costs (from BOM) × quantity',
          'This is stored on the order for later variance analysis',
          'Compare standard cost vs actual cost to identify cost overruns',
          'The BOM Cost Preview endpoint shows the full breakdown before creating an order',
        ],
        icon: DollarSign,
      },
      {
        title: 'Start Production',
        description: 'Move the order from "pending" to "in_progress" when production begins.',
        details: [
          'Click the "Start" button on a pending order',
          'The order status changes to "in_progress"',
          'The startDate is recorded automatically',
          'Ingredients are NOT deducted yet — deduction happens on completion',
        ],
        icon: ArrowRight,
      },
      {
        title: 'Complete Production',
        description: 'When production is finished, complete the order with actual results.',
        details: [
          'Click "Complete" on an in-progress order to open the completion modal',
          'Enter the actual quantity produced (may differ from planned)',
          'Enter the actual yield achieved',
          'Update labor and overhead costs if different from estimates',
          'Set quality status (pending, passed, failed, rework)',
          'Add quality notes if needed',
          'Confirm batch number for traceability',
          'On completion: raw materials are deducted from inventory, finished goods are added to stock, and a batch record is auto-created',
        ],
        icon: CheckCircle2,
      },
    ],
  },
  {
    id: 'qc',
    label: '4. Quality Control',
    icon: ClipboardCheck,
    color: 'bg-orange-500',
    steps: [
      {
        title: 'Create a Quality Check',
        description: 'Record quality inspections at any stage of production.',
        details: [
          'Go to Manufacturing → Quality Checks tab → Click "New Quality Check"',
          'Select the production order being inspected',
          'Choose the check type: Incoming Material, In-Process, or Final Inspection',
          'Set the status: Pending, Passed, Failed, or Rework',
          'Record defect quantity if any defects found',
          'Add a defect description and general notes',
          'The production order\'s quality status is automatically updated',
        ],
        icon: ClipboardCheck,
      },
      {
        title: 'Quality Status Tracking',
        description: 'Each production order has a quality status that updates as checks are performed.',
        details: [
          'Quality status appears as a badge on the production orders table',
          'Color-coded: yellow (pending), green (passed), red (failed), orange (rework)',
          'The inspector name and timestamp are recorded automatically',
          'Failed QC can trigger rework — update the order status back to in_progress',
        ],
        icon: ClipboardCheck,
      },
    ],
  },
  {
    id: 'batches',
    label: '5. Batch & Lot Tracking',
    icon: Package,
    color: 'bg-cyan-500',
    steps: [
      {
        title: 'Automatic Batch Creation',
        description: 'When a production order is completed with a batch number, a batch record is auto-created.',
        details: [
          'If you set a batch number on the production order, a ProductionBatch record is created on completion',
          'The batch records the quantity produced, manufacturing date, and linked product',
          'Batch status starts as "active"',
        ],
        icon: Package,
      },
      {
        title: 'Manual Batch Creation',
        description: 'You can also create batch records manually for additional tracking.',
        details: [
          'Go to Manufacturing → Batches tab → Click "New Batch"',
          'Select the production order',
          'Enter a unique batch number',
          'Set the quantity in this batch',
          'Set the manufactured date and expiry date (critical for food products)',
          'Add notes if needed',
        ],
        icon: Package,
      },
      {
        title: 'Batch Status Management',
        description: 'Track the lifecycle of each production batch.',
        details: [
          'Active — batch is in stock and available for sale',
          'Quarantined — batch is isolated pending investigation',
          'Recalled — batch has been recalled from the market',
          'Expired — batch has passed its expiry date',
          'Use the Batches tab to view and update batch statuses',
        ],
        icon: Package,
      },
    ],
  },
  {
    id: 'waste',
    label: '6. Waste Tracking',
    icon: AlertTriangle,
    color: 'bg-red-500',
    steps: [
      {
        title: 'Record Production Waste',
        description: 'Log waste whenever ingredients or finished goods are lost during production.',
        details: [
          'Go to Manufacturing → Waste tab → Click "Record Waste"',
          'Select the production order associated with the waste',
          'Select the product that was wasted (ingredient or finished good)',
          'Enter the quantity wasted',
          'Enter the unit cost of the wasted item',
          'Add a reason (e.g., "spillage", "contamination", "machine error")',
          'The waste quantity is automatically added to the production order\'s wasteQty',
        ],
        icon: AlertTriangle,
      },
    ],
  },
  {
    id: 'costing',
    label: '7. Cost Variance & Yield Analysis',
    icon: TrendingDown,
    color: 'bg-indigo-500',
    steps: [
      {
        title: 'Standard vs Actual Cost',
        description: 'The system tracks both expected and actual costs for every production order.',
        details: [
          'Standard Cost — auto-calculated from BOM ingredient costs at order creation',
          'Actual Cost — material cost + labor cost + overhead cost, updated on completion',
          'Cost Variance = Actual Cost − Standard Cost (shown in the orders table)',
          'Positive variance (red) means you spent more than expected',
          'Negative variance (green) means you produced more efficiently',
        ],
        icon: DollarSign,
      },
      {
        title: 'Yield Tracking',
        description: 'Compare expected output vs actual output for each production run.',
        details: [
          'Expected Yield — set when creating the order (defaults to planned quantity)',
          'Actual Yield — entered when completing the order',
          'Yield Variance = Actual Yield − Expected Yield',
          'Available in the Cost Analysis report for trend analysis',
        ],
        icon: TrendingDown,
      },
    ],
  },
  {
    id: 'scheduling',
    label: '8. Production Scheduling',
    icon: Calendar,
    color: 'bg-teal-500',
    steps: [
      {
        title: 'Planned Start & End Dates',
        description: 'Schedule production orders in advance with planned dates.',
        details: [
          'Set planned start and end dates when creating or editing a production order',
          'These dates are separate from actual start/end dates (recorded when status changes)',
          'Use the dates to plan production capacity and raw material procurement',
          'Filter orders by status to see what\'s scheduled, in progress, or completed',
        ],
        icon: Calendar,
      },
    ],
  },
  {
    id: 'reports',
    label: '9. Manufacturing Reports',
    icon: TrendingDown,
    color: 'bg-slate-600',
    steps: [
      {
        title: 'Available Reports',
        description: 'Access comprehensive manufacturing reports from the Reports section.',
        details: [
          'Manufacturing Summary — total orders, completed, cost breakdown, QC stats, yield, waste',
          'Production by Product — per-product order count, quantity, cost variance, QC pass/fail',
          'Waste Report — all waste records with quantities, costs, and reasons',
          'Cost Analysis — per-order standard vs actual cost, labor, overhead, yield variance, QC status, batch info',
          'BOM Report — all recipes with ingredient counts and costs',
        ],
        icon: TrendingDown,
      },
    ],
  },
  {
    id: 'example',
    label: '10. Example: Maize Flour Company',
    icon: Factory,
    color: 'bg-amber-500',
    steps: [
      {
        title: 'Setup Inventory',
        description: 'Create raw materials and finished goods in inventory.',
        details: [
          'Raw Materials: "Maize Grains" (KG, cost: 50/kg), "Packaging Bags" (Piece, cost: 5/each)',
          'Finished Goods: "Maize Flour 1kg" (Pack, price: 120, cost: 0 initially)',
          'Finished Goods: "Maize Flour 5kg" (Pack, price: 550, cost: 0 initially)',
        ],
        icon: Package,
      },
      {
        title: 'Create BOMs',
        description: 'Define recipes for each finished product.',
        details: [
          'BOM "1kg Flour Recipe": 1.1 KG Maize Grains + 1 Piece Packaging Bag → yields 1 Pack',
          'BOM "5kg Flour Recipe": 5.5 KG Maize Grains + 1 Piece Packaging Bag (5kg) → yields 1 Pack',
          'Standard cost auto-calculated: 1kg = (1.1×50) + (1×5) = 60 per pack',
        ],
        icon: Beaker,
      },
      {
        title: 'Run Production',
        description: 'Create and complete production orders for daily batches.',
        details: [
          'Create order: 1000 packs of "Maize Flour 1kg", link BOM, batch: BATCH-2024-001',
          'Standard cost: 1000 × 60 = 60,000',
          'Enter labor cost: 5,000, overhead cost: 3,000',
          'Start production → mill and package → complete order',
          'Enter actual quantity: 980 packs (20 lost to waste)',
          'Set quality status: Passed, batch: BATCH-2024-001',
          'On completion: 1,078 KG maize grains deducted, 980 bags deducted, 980 packs added to stock',
          'Batch record auto-created with expiry date',
        ],
        icon: Factory,
      },
      {
        title: 'Track & Analyze',
        description: 'Use QC, batches, and reports to monitor operations.',
        details: [
          'Record waste: 22 KG maize grains (spillage during milling)',
          'Quality check: Final Inspection — Passed, 0 defects',
          'Batch BATCH-2024-001: 980 packs, expiry 6 months from mfg date',
          'Cost Analysis report: Standard 60,000 vs Actual 68,000 → variance +8,000 (over budget)',
          'Yield: expected 1000, actual 980 → yield variance -20',
        ],
        icon: TrendingDown,
      },
    ],
  },
]

export default function ManufacturingGuidePage() {
  const [activeSection, setActiveSection] = useState(sections[0].id)

  const currentSection = sections.find(s => s.id === activeSection) || sections[0]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Factory className="h-7 w-7 text-blue-600" />
          Manufacturing & Production Guide
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Complete step-by-step walkthrough of the manufacturing module — from setup to production to reporting
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Sidebar navigation */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-700">Guide Sections</h3>
            </div>
            <nav className="p-2 space-y-1 max-h-[calc(100vh-200px)] overflow-y-auto">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition text-left',
                    activeSection === section.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  )}
                >
                  <div className={cn('flex h-7 w-7 items-center justify-center rounded-md text-white flex-shrink-0', section.color)}>
                    <section.icon className="h-4 w-4" />
                  </div>
                  <span className="flex-1 leading-tight">{section.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Content area */}
        <div className="space-y-4">
          {currentSection.steps.map((step, index) => {
            const StepIcon = step.icon
            return (
              <div key={index} className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="flex items-start gap-4 p-5">
                  {/* Step number circle */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className={cn('flex h-10 w-10 items-center justify-center rounded-full text-white font-bold text-sm', currentSection.color)}>
                      {index + 1}
                    </div>
                    {index < currentSection.steps.length - 1 && (
                      <div className="w-px h-full bg-gray-200 mt-2 min-h-[40px]" />
                    )}
                  </div>

                  {/* Step content */}
                  <div className="flex-1 min-w-0 pb-2">
                    <div className="flex items-center gap-2 mb-2">
                      <StepIcon className="h-5 w-5 text-gray-500" />
                      <h3 className="font-semibold text-gray-900">{step.title}</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{step.description}</p>
                    {step.details && (
                      <ul className="space-y-2">
                        {step.details.map((detail, di) => (
                          <li key={di} className="flex items-start gap-2 text-sm text-gray-600">
                            <Circle className="h-2 w-2 mt-1.5 text-gray-400 flex-shrink-0 fill-current" />
                            <span>{detail}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Navigation buttons */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => {
                const idx = sections.findIndex(s => s.id === activeSection)
                if (idx > 0) setActiveSection(sections[idx - 1].id)
              }}
              disabled={sections.findIndex(s => s.id === activeSection) === 0}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
            <span className="text-sm text-gray-400">
              {sections.findIndex(s => s.id === activeSection) + 1} / {sections.length}
            </span>
            <button
              onClick={() => {
                const idx = sections.findIndex(s => s.id === activeSection)
                if (idx < sections.length - 1) setActiveSection(sections[idx + 1].id)
              }}
              disabled={sections.findIndex(s => s.id === activeSection) === sections.length - 1}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
