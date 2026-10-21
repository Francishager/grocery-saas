import { type ReactNode } from 'react'
import { ArrowRight, BookOpen, CircleDollarSign, ClipboardCheck, Fuel, Gauge, PackageCheck, ShieldCheck, Truck } from 'lucide-react'

const sections = [
  ['setup', 'Provision & setup'], ['operations', 'Daily workflow'], ['posting', 'Automatic accounting'], ['terms', 'Key terms'], ['boundaries', 'Current scope & controls'],
]

function GuideSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} className="scroll-mt-20 border-t py-7 first:border-0 first:pt-0">
    <h2 className="mb-4 text-lg font-semibold">{title}</h2>
    {children}
  </section>
}

export default function FuelStationGuidePage() {
  return <main className="mx-auto max-w-6xl space-y-6">
    <header className="border-b pb-5">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-md bg-amber-100 text-amber-900"><Fuel className="size-5" /></div>
        <div>
          <p className="text-xs font-semibold uppercase text-amber-900">SaaS Admin documentation</p>
          <h1 className="mt-1 text-2xl font-semibold">Fuel Station Module Guide</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Provisioning, tank and pump operations, shift reconciliation, stock controls, and the automatic General Ledger entries.</p>
        </div>
      </div>
    </header>

    <nav aria-label="Guide sections" className="flex flex-wrap gap-2 border-b pb-4 text-sm">
      {sections.map(([id, label]) => <a key={id} href={`#${id}`} className="border-b-2 border-transparent px-2 py-1 text-muted-foreground hover:border-amber-700 hover:text-foreground">{label}</a>)}
    </nav>

    <GuideSection id="setup" title="Provision & setup">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { icon: ShieldCheck, title: 'Enable for the tenant', text: 'On SaaS Admin > Features, enable Fuel Station and only the subfeatures included in the tenant plan or override. Tenant staff access is separately controlled by Fuel Station permissions.' },
          { icon: PackageCheck, title: 'Configure tanks', text: 'Enter tank capacity, opening litres, and cost per litre. Opening quantity is recorded as a stock snapshot and opening-balance journal; do not enter the same stock again as a delivery.' },
          { icon: Gauge, title: 'Add pumps & prices', text: 'Assign each pump to its tank, then set pump prices with effective dates. Meter readings use the price effective on the reading date. A different amount needs a reason.' },
        ].map(({ icon: Icon, title, text }) => <article key={title} className="border-l-2 border-amber-500 pl-4"><Icon className="mb-2 size-5 text-amber-800" /><h3 className="font-medium">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{text}</p></article>)}
      </div>
    </GuideSection>

    <GuideSection id="operations" title="Daily workflow">
      <ol className="space-y-4">
        {[
          ['Receive fuel', 'Select an existing supplier and record their invoice reference, litres, and unit cost. The delivery creates a standard supplier purchase/payable, checks for duplicate invoices, and updates tank cost using weighted-average cost. Supplier payments and aging remain in Payables.'],
          ['Customer fuel credit', 'On shifts opened with individual ticketing, record a customer fuel invoice against the measured litres. The invoice posts to the standard customer receivable and can be repaid from Receivables; shift close reconciles its amount without posting the customer balance a second time.'],
          ['Open a shift', 'Choose the pump and shift number. Its opening meter must match the previous closing meter for that pump. Only one open shift per pump is allowed.'],
          ['Record meter sales', 'Enter the closing meter. Litres sold are the meter difference, not a manually entered quantity. The sale reduces book stock and records cost of sales at the tank weighted-average cost.'],
          ['Close and reconcile', 'Enter cash, mobile-money, credit, ancillary sales, and expenses. Select a permitted transaction account for each cash/mobile collection and expense payment. The server validates account ownership, method permission, and available balance.'],
          ['Review exceptions', 'Any collection-to-sales difference requires a reason and stays in Review Required. A different authorized user must review it. Do not use a stock adjustment to hide a till shortage.'],
        ].map(([title, text], index) => <li key={title} className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold">{index + 1}</span><div><h3 className="font-medium">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{text}</p></div></li>)}
      </ol>
    </GuideSection>

    <GuideSection id="posting" title="Automatic accounting entries">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted"><tr><th className="p-3 text-left">Event</th><th className="p-3 text-left">Debit</th><th className="p-3 text-left">Credit</th><th className="p-3 text-left">When it posts</th></tr></thead>
          <tbody>
            {[
              ['Opening fuel stock', 'Fuel Inventory', 'Fuel Opening Balance Equity', 'When a non-zero opening stock is created; existing tanks receive a one-time opening snapshot.'],
              ['Fuel delivery', 'Fuel Inventory', 'Fuel Supplier Clearing', 'When the delivery is recorded; no cash account is reduced until a payment workflow exists.'],
              ['Metered fuel sale', 'Fuel Sales Clearing', 'Fuel Sales Revenue', 'When the meter reading is saved.'],
              ['Fuel cost of sales', 'Fuel Cost of Sales', 'Fuel Inventory', 'At the meter reading, litres sold × weighted-average unit cost.'],
              ['Shift close', 'Selected cash/mobile account; fuel credit control; shift shortages; shift expenses', 'Fuel Sales Clearing; ancillary revenue; overages; selected expense payment account', 'When the shift is closed. Cash/mobile accounts also receive cash transactions; expense rows are included in Expenses.'],
              ['Approved stock increase/decrease', 'Fuel Inventory or Fuel Stock Adjustment Losses', 'Fuel Stock Adjustment Gains or Fuel Inventory', 'Only after an independent user approves the adjustment.'],
            ].map(([event, debit, credit, when]) => <tr key={event} className="border-t align-top"><td className="p-3 font-medium">{event}</td><td className="p-3">{debit}</td><td className="p-3">{credit}</td><td className="p-3 text-muted-foreground">{when}</td></tr>)}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">Journal entries are system-generated, posted, tenant-scoped, and source-linked to the fuel event. Existing cash and mobile-money Chart of Accounts links are synchronized from their transaction accounts.</p>
    </GuideSection>

    <GuideSection id="terms" title="Key terms">
      <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2">
        {[
          ['Book stock', 'Litres the system calculates from opening stock, deliveries, meter sales, and approved adjustments.'],
          ['Dipstick reading', 'A physical observation compared with book stock. It does not change stock; submit an adjustment request if investigation supports correction.'],
          ['Weighted-average cost', 'The blended cost per litre after adding a delivery to existing stock. Sales use this cost for inventory and cost-of-sales postings.'],
          ['Fuel Sales Clearing', 'Temporary asset control account: meter sales debit it; shift close clears it to cash, mobile money, credit, or a documented variance. A non-zero balance needs investigation.'],
          ['Fuel Supplier Clearing', 'Legacy liability control for historical deliveries. New fuel invoices post to the mapped Accounts Payable control and the selected supplier subledger.'],
          ['Fuel Credit Receivables', 'Control balance for aggregate credit reported at shift close. Customer invoices entered individually post to the standard receivables subledger instead.'],
          ['Shift variance', 'Reported cash + mobile + credit less meter and other sales. Shortage/overage is separately journaled and requires independent review.'],
          ['Opening balance equity', 'The offset used for the current stock snapshot when this fuel ledger is first enabled; it is not sales income.'],
        ].map(([term, definition]) => <div key={term} className="border-l-2 border-muted pl-4"><dt className="font-medium">{term}</dt><dd className="mt-1 text-sm text-muted-foreground">{definition}</dd></div>)}
      </dl>
    </GuideSection>

    <GuideSection id="boundaries" title="Current scope & controls">
      <ul className="space-y-2 text-sm text-muted-foreground">
        <li className="flex gap-2"><ArrowRight className="mt-0.5 size-4 shrink-0 text-amber-800" />Historical tank balances are snapshot as opening stock; prior deliveries and meter movements are not reconstructed as historical journals.</li>
        <li className="flex gap-2"><ArrowRight className="mt-0.5 size-4 shrink-0 text-amber-800" />New deliveries link to a JibuSales Supplier and create a payable invoice. Historical unlinked deliveries remain unassigned for review; do not guess-match them from supplier names. Fuel input tax is not currently captured.</li>
        <li className="flex gap-2"><ArrowRight className="mt-0.5 size-4 shrink-0 text-amber-800" />Shift credit is posted to a control account, not a named customer. Customer-level fuel credit and repayment require an explicit customer/fuel-card subledger workflow.</li>
        <li className="flex gap-2"><ArrowRight className="mt-0.5 size-4 shrink-0 text-amber-800" />This module does not calculate tax on fuel deliveries or sales. Apply the business’s approved tax configuration and review statutory reporting before filing.</li>
        <li className="flex gap-2"><ArrowRight className="mt-0.5 size-4 shrink-0 text-amber-800" />Tank stock cannot be edited directly. Adjustments require a reason and a different authorized approver; deletion preserves tanks with related history.</li>
      </ul>
      <div className="mt-5 flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground"><ClipboardCheck className="size-4" />Use the stock-history ledger, shift variance review, and General Journal source references during audit.</div>
      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Truck className="size-4" />Supplier clearing is intentionally not represented as paid cash.</div>
      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><CircleDollarSign className="size-4" />For accounting corrections, reverse the system journal through the authorized reversal process and correct the source event; do not edit account balances manually.</div>
    </GuideSection>

    <footer className="flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground"><BookOpen className="size-4" />Internal operational guide for JibuSales Admin</footer>
  </main>
}
