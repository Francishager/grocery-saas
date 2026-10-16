import { type ReactNode } from 'react'
import { ArrowDown, ArrowRight, BadgeCheck, BookOpen, Building2, CircleDollarSign, ClipboardList, FileCheck2, LockKeyhole, Megaphone, PackageCheck, ShieldCheck, Store, Truck } from 'lucide-react'

const permissionRows = [
  ['View Procurement Marketplace', 'Open the marketplace workspace and view supplier discovery, listings, campaigns, RFQs, and procurement records available to the tenant.'],
  ['Follow Marketplace Sellers', 'Follow sellers visible to the user and receive in-app/push notices for their new listings, public price changes, and campaigns. This is an individual user follow, not a tenant-wide subscription.'],
  ['Manage Supplier Relationships', 'Maintain the seller profile and request, approve, reject, or suspend supplier relationships.'],
  ['Publish Marketplace Listings', 'Create offers from the seller business catalogue.'],
  ['Publish Marketplace Price Changes', 'Change listing prices; every changed price is retained in price history.'],
  ['Publish Marketplace Promotions', 'Create time-limited promotion campaigns linked to an active listing.'],
  ['Run Marketplace Sponsored Offers', 'Publish sponsored placement in the JibuSales marketplace. This permission does not authorize paid ad spend.'],
  ['Manage Marketplace Campaigns', 'Pause, resume, or cancel the tenant’s promotions and sponsored offers.'],
  ['Create Procurement RFQs', 'Publish open requests to opted-in sellers or private requests to selected connected suppliers.'],
  ['Respond to Procurement RFQs', 'Submit and revise a seller quote for an RFQ the seller is allowed to access.'],
  ['Review Procurement Quotes', 'Review and compare received quotes, negotiate, and select an offer.'],
  ['Create Purchase Orders', 'Create a draft order from the selected quote.'],
  ['Approve Purchase Orders', 'Approve a draft purchase order and send it to the supplier.'],
  ['Acknowledge Purchase Orders', 'Accept or reject a purchase order addressed to the seller.'],
  ['Receive Procurement Goods', 'Map order lines to inventory and record partial or complete delivery into the selected branch.'],
  ['Submit Supplier Invoices', 'Submit an invoice for quantities received under an acknowledged order.'],
  ['Review Supplier Invoices', 'Match, approve, or reject the invoice against the order and accepted receipts. Approval posts buyer payables and linked seller accounting.'],
  ['Confirm Buyer-Submitted Marketplace Repayments', 'Confirm a buyer-reported repayment before it reduces the seller receivable.'],
  ['Record Seller-Received Marketplace Repayments', 'Record a repayment received directly by the seller into an account the staff member is allowed to use.'],
]

const workflow = [
  { icon: Store, title: '1. Enable and onboard', text: 'SaaS Admin provisions a supplier/manufacturer business by selecting a seller type and category. That flow creates its marketplace profile and enables the marketplace feature for that tenant. Existing businesses can be enabled with a subscription-plan feature or an explicit tenant override, then complete their seller profile in Procurement Network.' },
  { icon: ShieldCheck, title: '2. Assign access', text: 'In the business Roles & Permissions page, assign View Procurement Marketplace plus only the actions each staff member needs. Permissions are independent switches; JibuSales does not assign them based on a job title. The tenant owner has the owner-level access behavior already used elsewhere in the application.' },
  { icon: Building2, title: '3. Connect businesses', text: 'A buyer requests a relationship with an opted-in seller. The seller reviews and approves or rejects it. Private listings and private RFQs are restricted to active relationships and their participants.' },
  { icon: ClipboardList, title: '4. Request and quote', text: 'A buyer creates an open RFQ for opted-in sellers or a private RFQ for selected connected suppliers. Sellers submit offers privately to the buyer. Selecting an offer does not create stock, a sale, a payable, or a payment.' },
  { icon: FileCheck2, title: '5. Order and fulfil', text: 'The buyer creates a draft purchase order from the selected quote, approves it, and sends it. The supplier acknowledges or rejects it. The buyer maps order items to its own products and records goods received against a branch; partial receipts are supported.' },
  { icon: PackageCheck, title: '6. Invoice and account', text: 'The seller submits an invoice only for received quantities and maps each line to its own inventory product or service. The buyer matches the supplier, branch, order, and accepted receipts before approving. Approval creates buyer payables and the linked seller sale, receivable, journal and stock/COGS effects; it is not a second buyer sale.' },
  { icon: CircleDollarSign, title: '7. Receive and reconcile payment', text: 'A buyer-submitted payment remains pending until the seller confirms receipt. Alternatively, authorized seller staff can record money actually received into a permitted transaction account; the seller-side receivable is updated and the buyer-side payable is mirrored through Marketplace Settlement Clearing. The buyer reconciles that clearing balance to the actual account used. Both parties can print the payment acknowledgment or receipt provided by the workflow.' },
  { icon: Megaphone, title: '8. Promote offers', text: 'Authorized staff can publish a marketplace promotion or sponsored offer linked to an active seller listing, attach up to four campaign images, set run dates, and separately manage campaign status. Buyers see up to two images at a time without autoplay controls or image counters. This is an in-JibuSales placement only: it does not purchase external ads, send social posts, or charge an advertising fee.' },
]

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} className="scroll-mt-20 border-t py-7 first:border-0 first:pt-0">
    <h2 className="mb-4 text-lg font-semibold tracking-normal">{title}</h2>
    {children}
  </section>
}

export default function ProcurementGuidePage() {
  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="border-b pb-5">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-md bg-emerald-100 text-emerald-800"><BookOpen className="size-5" /></div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-emerald-800">SaaS Admin documentation</p>
          <h1 className="mt-1 text-2xl font-semibold">Procurement Network Guide</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">How tenant access, supplier discovery, quotes, orders, inventory, invoices, accounting, repayments, and seller campaigns work together.</p>
        </div>
      </div>
    </header>

    <nav aria-label="Guide sections" className="flex flex-wrap gap-2 border-b pb-4 text-sm">
      {[['overview', 'Overview'], ['enablement', 'Tenant enablement'], ['permissions', 'Permissions'], ['lifecycle', 'Procurement lifecycle'], ['accounting', 'Accounting & payments'], ['privacy', 'Privacy & controls'], ['support', 'Support checklist']].map(([id, label]) => <a key={id} href={`#${id}`} className="border-b-2 border-transparent px-2 py-1 text-muted-foreground hover:border-emerald-700 hover:text-foreground">{label}</a>)}
    </nav>

    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_250px]">
      <article className="min-w-0">
        <Section id="overview" title="What Procurement Network is">
          <p className="max-w-4xl text-sm leading-6 text-muted-foreground">Procurement Network is JibuSales’ opt-in business-to-business sourcing workflow. It lets businesses discover eligible suppliers, build approved relationships, request and compare offers, issue purchase orders, receive goods, match supplier invoices, and reconcile payments. It uses existing tenant accounts and inventory/accounting records instead of creating a separate seller application.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="border-l-2 border-emerald-700 pl-3"><strong className="text-sm">Not universal by default</strong><p className="mt-1 text-xs text-muted-foreground">The marketplace feature must be included in the tenant plan or explicitly enabled by override.</p></div>
            <div className="border-l-2 border-sky-700 pl-3"><strong className="text-sm">Not every user gets every action</strong><p className="mt-1 text-xs text-muted-foreground">Staff need the marketplace view permission and the specific action permissions assigned to them.</p></div>
            <div className="border-l-2 border-amber-600 pl-3"><strong className="text-sm">A quote is not a transaction</strong><p className="mt-1 text-xs text-muted-foreground">A selected offer becomes an order workflow; accounting and stock post only at their defined lifecycle steps.</p></div>
          </div>
        </Section>

        <Section id="enablement" title="Tenant feature enablement">
          <ol className="space-y-3 text-sm leading-6 text-muted-foreground">
            <li><strong className="text-foreground">Plan access:</strong> `procurement.marketplace` must be enabled for the tenant’s plan. A plan feature is the standard way to offer the module to a group of tenants.</li>
            <li><strong className="text-foreground">Tenant override:</strong> SaaS Admin can explicitly turn the feature on or off for one tenant. Overrides take precedence over the plan feature.</li>
            <li><strong className="text-foreground">Seller onboarding:</strong> In SaaS Admin → Provision, choosing Supplier / reseller, Manufacturer, or Both and entering a category creates a discoverable seller profile and enables the marketplace feature for that newly provisioned seller tenant.</li>
            <li><strong className="text-foreground">Ordinary tenant provisioning:</strong> Leaving the marketplace seller profile empty does not run the seller-specific enablement. Other tenants rely on their plan or a tenant override.</li>
            <li><strong className="text-foreground">After enablement:</strong> The feature gate is checked on both tenant navigation and API routes. A staff user still needs `canViewProcurement` to open the workspace; action permissions alone do not grant the feature or page access.</li>
          </ol>
          <div className="mt-4 flex items-start gap-2 border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground"><ArrowDown className="mt-0.5 size-4 shrink-0" />Database migrations install marketplace tables and the feature registry entry; they do not automatically grant the feature to every tenant. Apply migrations before provisioning marketplace sellers.</div>
        </Section>

        <Section id="permissions" title="Marketplace permissions board">
          <p className="mb-4 text-sm leading-6 text-muted-foreground">These permissions are intentionally independent. SaaS Admin does not assign them by job title; the business owner/admin decides which individual staff members receive which switches. In addition to an action permission, the staff user generally needs <strong className="text-foreground">View Procurement Marketplace</strong> to open the module.</p>
          <div className="overflow-x-auto border">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-muted/50"><tr><th className="p-3 font-semibold">Permission</th><th className="p-3 font-semibold">Allows</th></tr></thead>
              <tbody className="divide-y">{permissionRows.map(([name, description]) => <tr key={name}><td className="p-3 align-top font-medium">{name}</td><td className="p-3 align-top text-muted-foreground">{description}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">The former bundled catalogue permission is retained only for migration compatibility. Its existing assignments are copied to the separate listing and price permissions; use the new switches for ongoing administration.</p>
        </Section>

        <Section id="lifecycle" title="End-to-end workflow">
          <div className="space-y-3">{workflow.map(({ icon: Icon, title, text }) => <div key={title} className="grid grid-cols-[36px_minmax(0,1fr)] gap-3 border-b pb-3 last:border-0"><div className="grid size-9 place-items-center rounded-md bg-muted text-foreground"><Icon className="size-4" /></div><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p></div></div>)}</div>
        </Section>

        <Section id="accounting" title="Accounting, stock, and payment controls">
          <div className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p><strong className="text-foreground">Buyer side:</strong> order receipt increases inventory only for accepted quantities. Invoice approval creates the buyer payable using the supplier and branch selected during review. It should not be mistaken for a second ordinary point-of-sale transaction.</p>
            <p><strong className="text-foreground">Seller side:</strong> approved procurement invoices are mirrored to the seller’s customer receivable and sale. For goods, mapped seller products support stock-out and COGS posting; services do not create stock movements. Seller receivables and accounting setup must be available for the posting to complete.</p>
            <p><strong className="text-foreground">Buyer-submitted repayment:</strong> it remains pending on the seller side and does not reduce the seller receivable until confirmed. Confirmation is idempotent to prevent duplicate application.</p>
            <p><strong className="text-foreground">Seller-recorded repayment:</strong> the seller selects an allowed receiving transaction account. Seller cash/bank and receivable are updated, and the buyer payable is reduced against Marketplace Settlement Clearing. The buyer then reconciles clearing against the account that actually paid the seller. This avoids pretending that the seller can directly post into the buyer’s private cash account.</p>
            <p><strong className="text-foreground">Posting prerequisites:</strong> accounting configs and the marketplace settlement clearing account must exist on the relevant tenant. If required setup is missing, the posting endpoint should return an error and avoid completing only one side.</p>
          </div>
          <div className="mt-4 flex items-start gap-2 border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><CircleDollarSign className="mt-0.5 size-4 shrink-0" />Do not mark a payment as received based only on a buyer message or proof upload. The seller must confirm it, or authorized seller staff must record money actually received into a permitted account.</div>
        </Section>

        <Section id="privacy" title="Privacy, discovery, and seller campaigns">
          <div className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>Public discovery includes only opted-in seller profiles and listings explicitly marked public. Private listings require an active supplier relationship. Open RFQs are visible to eligible opted-in sellers; private RFQs and quote discussions are limited to their participants.</p>
            <p>Unrelated businesses must not see private quotations, negotiated prices, customer lists, purchase histories, invoices, account balances, or other confidential records. Public campaign placements are shown only where the linked listing is already visible to the viewer.</p>
            <p>Marketplace promotions and sponsored offers are internal JibuSales placements attached to active listings. Their title, message, and run dates are visible to eligible buyers. The current implementation does not buy external media, post to social networks, or incur advertising charges.</p>
            <p>Campaign creation, status changes, price changes, image uploads, and financial posting steps should remain permission-checked and auditable. Sellers can pause/resume or cancel campaigns only with the campaign-management permission. Followers are individual buyer users; a post notification is sent only if the underlying listing is still visible to that buyer.</p>
            <p>AI market notes use only currently visible marketplace listings, recent public/connected price changes, and active campaign copy. They do not receive private RFQs, invoices, customer lists, purchase history, or account balances. The system does not label an offer as trending without real marketplace engagement data to support that claim.</p>
          </div>
        </Section>

        <Section id="support" title="SaaS Admin support checklist">
          <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
            <li><strong className="text-foreground">Menu missing:</strong> confirm the tenant plan feature or tenant override is enabled, the feature is active, and the user has `canViewProcurement`.</li>
            <li><strong className="text-foreground">Seller absent from discovery:</strong> verify seller profile exists, discovery is opted in, and the listing is public or the buyer has an active relationship for a private listing.</li>
            <li><strong className="text-foreground">A staff action is missing:</strong> check the exact permission switch on the business’s Roles & Permissions page. Do not grant unrelated permissions as a workaround.</li>
            <li><strong className="text-foreground">Invoice approval fails:</strong> validate received quantities, product mappings, supplier and branch selection, and the buyer/seller accounting setup. Avoid manually creating a duplicate sale or payable.</li>
            <li><strong className="text-foreground">Payment is pending:</strong> a buyer-submitted repayment awaits seller confirmation. A seller-entered receipt follows the alternate direct-recording path and uses Marketplace Settlement Clearing on the buyer side.</li>
            <li><strong className="text-foreground">Feature unavailable after deployment:</strong> check migration status and confirm that the feature registry entry exists before changing tenant overrides.</li>
            <li><strong className="text-foreground">Investigate safely:</strong> use tenant-scoped audit records and transaction references. Do not inspect or disclose another tenant’s private procurement data to resolve a support request.</li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-2"><a href="/saas/features" className="inline-flex items-center gap-2 border px-3 py-2 text-sm font-medium hover:bg-muted">Open Features <ArrowRight className="size-4" /></a><a href="/saas/businesses" className="inline-flex items-center gap-2 border px-3 py-2 text-sm font-medium hover:bg-muted">Open Businesses <ArrowRight className="size-4" /></a></div>
        </Section>
      </article>

      <aside className="hidden lg:block">
        <div className="sticky top-24 border-l pl-5">
          <h2 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Admin reminders</h2>
          <ul className="space-y-4 text-xs leading-5 text-muted-foreground">
            <li className="flex gap-2"><BadgeCheck className="size-4 shrink-0 text-emerald-700" />Plan/override turns on the module; staff permissions control what each staff member can do.</li>
            <li className="flex gap-2"><LockKeyhole className="size-4 shrink-0 text-emerald-700" />Keep quotes, invoices, payment details, and business records tenant-private.</li>
            <li className="flex gap-2"><Truck className="size-4 shrink-0 text-emerald-700" />A quote is not a purchase, stock receipt, invoice approval, or payment.</li>
            <li className="flex gap-2"><Megaphone className="size-4 shrink-0 text-emerald-700" />Sponsored offers are in-app placements only; no external ad spend is initiated.</li>
          </ul>
        </div>
      </aside>
    </div>
  </div>
}
