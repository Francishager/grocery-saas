import { requestBusinessAdvice } from './businessAdvisor.js';

const generalTopics = [
  ['Sales conversion', 'Notice which products or services customers ask about but do not buy. Make the next step easier and review whether more enquiries turn into sales.'],
  ['Customer retention', 'Choose one helpful follow-up for customers who have not returned recently. Track how many respond before repeating the approach.'],
  ['Inventory planning', 'Check slow-moving stock before reordering. Compare its holding cost with current demand and use the result to plan the next purchase.'],
  ['Pricing', 'Review one frequently sold item’s cost and selling price before changing its price or offering a discount.'],
  ['Cash flow', 'Compare expected collections with supplier and operating payments due soon before committing cash to a new expense.'],
  ['Marketing', 'Promote one clear customer benefit through a channel your customers already use, then keep track of the enquiries it brings.'],
  ['Receivables', 'Prioritize respectful follow-up on overdue balances and agree a clear next payment date with each customer.'],
  ['Service quality', 'Ask a recent customer one short question about their experience. Choose one practical improvement based on the answers.'],
  ['Product mix', 'Look for items customers often buy together and make that useful combination easier to discover.'],
  ['Team operations', 'Find one repeated task that slows service. Agree on one small change and check whether it saves time this week.'],
  ['Profit discipline', 'Check recorded cost and net selling price before running a promotion. Higher sales volume alone does not show whether profit improved.'],
  ['Weekly goals', 'Choose one measurable goal for this week, assign someone to track it, and review the result before setting the next goal.'],
];

const tipCatalogues = {
  retail: [
    ['Stock accuracy', 'Review a few fast-moving items and compare the recorded quantity with a physical count before placing the next order.'],
    ['Reorder planning', 'Check lead time and recent demand before restocking; avoid tying up cash in slow-moving products.'],
    ['Customer follow-up', 'Choose one useful follow-up for a customer who has not returned recently and track whether it brings them back.'],
    ['Pricing discipline', 'Check the recorded cost and selling price before changing a price or running a promotion.'],
    ['Product discovery', 'Make one frequently requested item easier to find by checking its category, name and search terms.'],
    ['Cash planning', 'Compare expected customer collections with supplier and operating payments due soon.'],
    ['Weekly review', 'Pick one measurable sales or stock goal for the week and review it before setting another.'],
  ],
  food: [
    ['Menu performance', 'Compare item sales with ingredient usage before changing menu prices or portion sizes.'],
    ['Waste control', 'Record one recurring source of preparation or spoilage waste and test a small way to reduce it.'],
    ['Service readiness', 'Review the next busy service period and confirm that key ingredients and staff coverage are ready.'],
    ['Menu mix', 'Highlight a popular combination that is already on the menu; check its ingredient cost before discounting it.'],
    ['Supplier planning', 'Check delivery timing and short-dated stock before placing the next food or beverage order.'],
    ['Guest feedback', 'Ask one recent guest a short question about service and turn the answer into one practical improvement.'],
    ['Shift handover', 'Use a brief handover to flag low stock, open orders and tasks that the next shift must complete.'],
  ],
  salon: [
    ['Rebooking', 'At checkout, invite a satisfied client to book their next visit and record the preferred service.'],
    ['Chair planning', 'Review upcoming appointments alongside chair availability so stylists are not double-booked.'],
    ['Walk-in service', 'Agree how walk-ins are assigned and record who served each client for clear accountability.'],
    ['Service profitability', 'Compare service prices with the time and consumables required before changing a menu price.'],
    ['Commission review', 'Check recorded completed services before approving stylist commissions or making a payout.'],
    ['Client retention', 'Follow up respectfully with clients who are due for a repeat service; avoid sending duplicate messages.'],
    ['Retail products', 'Review salon product stock and expiry dates before recommending or reordering products.'],
  ],
  healthcare: [
    ['Prescription handoff', 'Review open prescription handoffs and confirm that fulfilment status is updated by the responsible team.'],
    ['Expiry control', 'Check near-expiry medicine stock and follow your approved handling and disposal procedures.'],
    ['Appointment readiness', 'Review the next clinic schedule and prepare the workflow without exposing patient details in shared spaces.'],
    ['Stock planning', 'Compare medicine usage with supplier lead times before reordering; follow your licensed clinical protocols.'],
    ['Record quality', 'Check that completed encounters and dispensing outcomes are recorded in the correct patient workflow.'],
    ['Service follow-up', 'Review due follow-ups using the clinic’s approved process and protect patient confidentiality.'],
    ['Operational review', 'Choose one non-clinical workflow delay to improve, such as queue handling or stock handoff.'],
  ],
  property: [
    ['Rent schedule', 'Review rent periods due soon and confirm that the charge schedule matches the tenancy agreement.'],
    ['Arrears follow-up', 'Prioritize respectful follow-up on overdue rent and record an agreed next step or payment date.'],
    ['Deposit records', 'Check that tenant deposits remain separately identified and are not treated as rental income.'],
    ['Maintenance planning', 'Review open maintenance requests and assign a responsible person and target date.'],
    ['Occupancy records', 'Confirm that move-in and move-out status reflects the actual occupancy, not merely the paid-through date.'],
    ['Owner reporting', 'Reconcile collected rent, owner amounts due and recorded payouts before sharing a statement.'],
    ['Renewal planning', 'Review agreements approaching renewal and contact the tenant or owner early to agree next steps.'],
  ],
  rental: [
    ['Availability', 'Check upcoming bookings against asset availability and allow enough time for inspection and preparation.'],
    ['Return inspection', 'Record returned-item condition promptly and document any damage before closing the booking.'],
    ['Booking margin', 'Review discounts and added service charges against the cost of delivering the booking before confirming a change.'],
    ['Deposit handling', 'Keep refundable deposits distinct from earned rental revenue until the agreement says they are earned.'],
    ['Late returns', 'Use clear return times and a consistent follow-up process for overdue bookings.'],
    ['Asset readiness', 'Identify equipment due for cleaning, maintenance or repair before its next reservation.'],
    ['Repeat bookings', 'Follow up after completed bookings and record the customer’s feedback and likely next need.'],
  ],
  service: [
    ['Job scheduling', 'Review upcoming jobs against team capacity and confirm the customer, scope and promised date.'],
    ['Quote follow-up', 'Follow up on open quotes with one clear question and record the outcome for the next team member.'],
    ['Job costing', 'Compare recorded materials and labour with the quoted scope before closing a completed job.'],
    ['Customer updates', 'Send a brief progress update when a job date or scope changes, and record the communication.'],
    ['Repeat business', 'Identify one completed job that may need a planned follow-up or maintenance visit.'],
    ['Team workflow', 'Find one avoidable handoff delay and agree who owns the next action.'],
    ['Cash planning', 'Review outstanding invoices and near-term operating payments before committing to new costs.'],
  ],
  manufacturing: [
    ['Production planning', 'Compare the next production plan with available materials and supplier lead times before releasing work.'],
    ['Yield review', 'Record actual output and waste for one production run, then investigate the largest variance.'],
    ['Quality checks', 'Confirm that required quality checks are recorded before a batch moves to the next stage.'],
    ['Reorder timing', 'Review reorder points against production demand and delivery lead times, not just current stock.'],
    ['Unit costing', 'Check material and conversion costs before changing a finished-goods selling price.'],
    ['Equipment care', 'Schedule preventative maintenance around production demand to reduce avoidable downtime.'],
    ['Order commitments', 'Compare open customer orders with realistic production capacity before confirming delivery dates.'],
  ],
};

const welcomeTracks = {
  retail: [
    ['Welcome to JibuSales', 'Start with your product catalogue: check product names, base units, opening quantities and selling prices before recording sales.'],
    ['Set up your customers', 'Add the customers you serve regularly and record only the details your business needs to operate.'],
    ['Check your stock', 'Review a small physical count against the opening quantities entered so the first stock movements begin from a reliable point.'],
    ['Prepare your suppliers', 'Add key suppliers and confirm payment terms before recording the first purchase.'],
    ['Review checkout', 'Run through a sample sale workflow with your team and confirm receipt details before serving customers.'],
    ['Set a first goal', 'Choose one simple weekly measure, such as stock accuracy or repeat visits, and record a baseline.'],
    ['Your first-week review', 'Review recorded sales, stock movements and open balances; use actual records rather than estimates.'],
  ],
  food: [
    ['Welcome to JibuSales', 'Begin with your menu and recipe or ingredient links, then check prices and stock units before taking live orders.'],
    ['Prepare your service flow', 'Set up order types and service areas, then decide how staff will hand off orders during busy periods.'],
    ['Check ingredients', 'Enter opening stock using the correct base units and verify key quantities against a physical count.'],
    ['Review your menu costs', 'Check ingredient costs for popular menu items before using discounts or changing prices.'],
    ['Plan your first shift', 'Agree who handles orders, preparation and checkout, and how open orders are handed over.'],
    ['Set a first goal', 'Choose one weekly measure, such as order completion time or recorded waste, and establish a baseline.'],
    ['Your first-week review', 'Review actual orders, stock usage and recorded expenses to decide what needs attention next.'],
  ],
  salon: [
    ['Welcome to JibuSales', 'Set up your service menu, prices and expected duration before scheduling appointments or serving walk-ins.'],
    ['Prepare the team workflow', 'Decide how clients are assigned to stylists and chairs, including how walk-ins are recorded.'],
    ['Add your clients', 'Bring in existing client records carefully and avoid creating duplicates when the same person books again.'],
    ['Check service costing', 'Review consumables and time for popular services before setting discounts or commission rules.'],
    ['Practice checkout', 'Run through a sample appointment and walk-in checkout, including receipt and stylist attribution.'],
    ['Set a first goal', 'Choose one weekly measure, such as rebooking rate or appointment punctuality, and establish a baseline.'],
    ['Your first-week review', 'Review bookings, completed services and commissions from recorded activity before making adjustments.'],
  ],
  healthcare: [
    ['Welcome to JibuSales', 'Set up clinic and pharmacy workflows separately and confirm access permissions before entering live records.'],
    ['Protect patient information', 'Give staff only the access they need and keep patient details out of shared notices and general messages.'],
    ['Prepare medicine records', 'Check medicine units, opening quantities and expiry dates against the physical stock before dispensing.'],
    ['Review the prescription handoff', 'Agree how clinic prescriptions reach pharmacy staff and how supplied or unavailable items are recorded.'],
    ['Check the daily workflow', 'Walk through appointment, consultation and dispensing steps using your approved clinical procedures.'],
    ['Set an operations goal', 'Choose one non-clinical measure, such as queue time or stock-record accuracy, and establish a baseline.'],
    ['Your first-week review', 'Review workflow completion and stock records; follow your professional and regulatory procedures for clinical decisions.'],
  ],
  property: [
    ['Welcome to JibuSales', 'Set up properties, units, owners and tenant agreements before recording rent charges or payments.'],
    ['Confirm each tenancy', 'Check start dates, rent amounts, paid-through records and occupancy status against the signed agreement.'],
    ['Keep deposits distinct', 'Record security deposits separately from rent and agree how they may be applied or refunded.'],
    ['Prepare rent schedules', 'Review upcoming rent periods and confirm the rate history before generating new charges.'],
    ['Set up follow-ups', 'Schedule reminders for rent due dates, agreement renewals and maintenance responsibilities.'],
    ['Set a first goal', 'Choose one weekly measure, such as on-time collection or open maintenance requests, and establish a baseline.'],
    ['Your first-week review', 'Review rent charges, payments, arrears and owner amounts due against the underlying agreements.'],
  ],
  rental: [
    ['Welcome to JibuSales', 'Set up rentable items, rates, availability and condition checks before taking the first reservation.'],
    ['Prepare booking terms', 'Confirm collection and return times, deposit rules and any optional service charges.'],
    ['Check your assets', 'Count and inspect rentable items, then compare their opening condition and availability with the records.'],
    ['Practice the booking flow', 'Walk through reserve, checkout, payment and return steps with a sample booking before serving customers.'],
    ['Plan maintenance', 'Set a process for cleaning, inspection and repair between bookings.'],
    ['Set a first goal', 'Choose one weekly measure, such as asset utilization or on-time returns, and establish a baseline.'],
    ['Your first-week review', 'Review completed bookings, balances and asset condition records before changing rates or terms.'],
  ],
  service: [
    ['Welcome to JibuSales', 'Set up your services, standard rates and job workflow before creating live customer bookings.'],
    ['Prepare your customer pipeline', 'Record prospects and existing customers separately, then agree how a prospect becomes a customer.'],
    ['Clarify service scope', 'Use a clear description of what each service includes and how extra work is quoted.'],
    ['Practice job tracking', 'Walk through booking, assignment, completion and payment recording with your team.'],
    ['Plan customer updates', 'Agree when customers receive progress updates and where your team records the follow-up.'],
    ['Set a first goal', 'Choose one weekly measure, such as quote conversion or on-time completion, and establish a baseline.'],
    ['Your first-week review', 'Review actual bookings, completed work and outstanding balances to decide the next improvement.'],
  ],
  manufacturing: [
    ['Welcome to JibuSales', 'Set up raw materials, units, opening stock and production records before posting the first production run.'],
    ['Check bills of materials', 'Review component quantities and units for one product before using it to plan production.'],
    ['Verify opening stock', 'Compare key material counts with entered quantities so production starts from a reliable stock position.'],
    ['Practice a production run', 'Walk through material issue, output recording and waste capture with a controlled sample.'],
    ['Review product costs', 'Confirm recorded materials and production costs before setting finished-goods prices.'],
    ['Set a first goal', 'Choose one weekly measure, such as yield or schedule adherence, and establish a baseline.'],
    ['Your first-week review', 'Review recorded production, inventory movements and costs before changing the plan.'],
  ],
  general: [
    ['Welcome to JibuSales', 'Start with your business profile, team access and the core products or services you provide.'],
    ['Set up customers', 'Add the customers you serve and keep their details accurate without creating duplicate records.'],
    ['Review opening records', 'Check opening balances and stock quantities against your source records before relying on reports.'],
    ['Prepare your team', 'Give each staff member only the permissions needed for their role and confirm the workflows they will use.'],
    ['Practice a transaction', 'Run through a sample sale or service workflow, including payment recording and receipt details.'],
    ['Set a first goal', 'Choose one weekly business measure and establish a baseline from real activity.'],
    ['Your first-week review', 'Review the records entered this week and correct any setup gaps before scaling the workflow.'],
  ],
};

function businessTipGroup(businessType) {
  const type = String(businessType || '').trim().toLowerCase().replace(/[&\s-]+/g, '_');
  if (['retail', 'hardware', 'supermarket', 'wholesale', 'pharmacy', 'bakery'].includes(type)) return type === 'pharmacy' ? 'healthcare' : 'retail';
  if (['restaurant', 'bar', 'restaurant_bar', 'cafe', 'coffee_shop', 'fast_food', 'hotel_restaurant'].includes(type)) return 'food';
  if (['salon_spa', 'salon', 'spa'].includes(type)) return 'salon';
  if (['clinic', 'clinic_pharmacy', 'healthcare'].includes(type)) return 'healthcare';
  if (['property_management', 'landlord', 'property_agent'].includes(type)) return 'property';
  if (['rental', 'rentals', 'equipment_rental', 'event_rental'].includes(type)) return 'rental';
  if (['manufacturing', 'production'].includes(type)) return 'manufacturing';
  if (['service', 'service_business', 'repair_shop', 'car_wash', 'event_management'].includes(type)) return 'service';
  return 'general';
}

function localClock(date, timeZone) {
  const options = { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  let parts;
  try { parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(date); }
  catch { timeZone = 'Africa/Kampala'; parts = new Intl.DateTimeFormat('en-CA', { ...options, timeZone }).formatToParts(date); }
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const day = `${fields.year}-${fields.month}-${fields.day}`;
  const ordinal = Math.floor(Date.UTC(Number(fields.year), Number(fields.month) - 1, Number(fields.day)) / 86400000);
  return { day, minute: Number(fields.hour) * 60 + Number(fields.minute), ordinal, timeZone };
}

export function advisorTipTopics(dayOrdinal, businessType = 'other', welcomeDay = null) {
  const group = businessTipGroup(businessType);
  if (Number.isInteger(welcomeDay) && welcomeDay >= 0 && welcomeDay < 7) {
    const welcome = welcomeTracks[group] || welcomeTracks.general;
    return [[`Welcome: ${welcome[welcomeDay][0]}`, welcome[welcomeDay][1]], (tipCatalogues[group] || generalTopics)[dayOrdinal % (tipCatalogues[group] || generalTopics).length]];
  }
  const topics = tipCatalogues[group] || generalTopics;
  const morning = ((dayOrdinal * 7) % topics.length + topics.length) % topics.length;
  const afternoon = (morning + Math.max(1, Math.floor(topics.length / 2))) % topics.length;
  return [topics[morning], topics[afternoon]];
}

export function advisorTipId(userId, day, slot) {
  return `advisor-tip:${userId}:${day}:${slot}`;
}

function parseGeneratedTip(reply) {
  const content = String(reply || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed;
  try { parsed = JSON.parse(content); } catch { return null; }
  if (typeof parsed?.title !== 'string' || typeof parsed?.message !== 'string') return null;
  const title = parsed.title.trim().replace(/\s+/g, ' ').slice(0, 80);
  const message = parsed.message.trim().replace(/\s+/g, ' ').slice(0, 600);
  if (title.length < 3 || message.length < 40) return null;
  return { title, message };
}

async function generateProfessionalTip({ businessType, welcome, fallback }, generateTip) {
  if (generateTip) return generateTip({ businessType, welcome, fallback });
  if (!process.env.NVIDIA_API_KEY) return null;

  const type = String(businessType || 'small business').replace(/[\r\n]/g, ' ').slice(0, 80);
  const systemPrompt = `You are JibuSales SME business adviser with the practical discipline of a management accountant, cash-flow adviser, and investor-readiness coach. Give sound, conservative, useful guidance that can strengthen a small business. Never pretend to be a licensed accountant, lawyer, tax agent, clinician or investment adviser. Do not recommend specific securities, promise returns, invent market facts, financial figures, customer facts, or claim to have inspected business records. Do not tell the user to manipulate accounts or bypass tax, employment, privacy, licensing or safety requirements. Prefer accurate bookkeeping, cash conversion, gross-margin awareness, working capital, controls, customer retention, productivity, and investment readiness. Advice must be specific to the business type but remain useful without private business records. For healthcare businesses, avoid clinical advice and protect patient confidentiality. Return only a JSON object with string fields title and message. The title must be under 60 characters. The message must be 1-2 concise sentences, 35-90 words, contain one concrete action and explain the business value or a simple way to measure it. No markdown, greeting, numbers presented as business facts, or generic motivational language.`;
  const stage = welcome ? 'This business account is in its first seven days. Give a welcoming setup or first-week control tip, not a claim about historical performance.' : 'This is a continuing daily insight. Do not repeat a welcome message.';
  const prompt = `Business type: ${type}. ${stage} Theme to develop: ${fallback[0]}. The supplied theme idea is: ${fallback[1]} Create a more professionally useful accountant/investor-quality business tip without inventing any facts or figures.`;
  try {
    const response = await requestBusinessAdvice({
      messages: [{ role: 'user', content: prompt }],
      context: {},
      systemPrompt,
      maxTokens: 260,
      jsonMode: true,
      signal: AbortSignal.timeout(8000),
    });
    return parseGeneratedTip(response.reply);
  } catch (error) {
    console.warn('AI daily tip generation fell back to the curated tip:', error.code || 'AI_UNAVAILABLE');
    return null;
  }
}

async function getOrCreateTipContent(db, params, generateTip) {
  return db.$transaction(async (tx) => {
    const lockKey = `advisor-tip:${params.tenantId}:${params.day}:${params.slot}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    const where = { tenantId_tipDate_slot: { tenantId: params.tenantId, tipDate: params.day, slot: params.slot } };
    const existing = await tx.advisorDailyTipContent.findUnique({ where });
    if (existing) return existing;

    const generated = await generateProfessionalTip({
      businessType: params.businessType,
      welcome: params.welcome,
      fallback: params.topic,
    }, generateTip);
    const content = generated || { title: params.topic[0], message: params.topic[1] };
    return tx.advisorDailyTipContent.create({
      data: {
        tenantId: params.tenantId,
        tipDate: params.day,
        slot: params.slot,
        businessType: params.businessType || null,
        title: content.title,
        message: content.message,
      },
    });
  }, { timeout: 12000, maxWait: 3000 });
}

export async function deliverDueAdvisorTips(db, req, now = new Date(), { generateTip } = {}) {
  const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
  const userId = req.user.id;
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true, businessType: true, createdAt: true } });
  const clock = localClock(now, tenant?.timezone || 'Africa/Kampala');
  const createdDay = tenant?.createdAt ? localClock(new Date(tenant.createdAt), tenant?.timezone || 'Africa/Kampala').ordinal : null;
  const daysSinceCreated = createdDay === null ? null : Math.max(0, clock.ordinal - createdDay);
  const welcomeDay = daysSinceCreated !== null && daysSinceCreated < 7 ? daysSinceCreated : null;
  const topicsForDay = advisorTipTopics(clock.ordinal, tenant?.businessType, welcomeDay);
  const slots = [
    { key: 'morning', minute: 9 * 60, topic: topicsForDay[0] },
    { key: 'afternoon', minute: 15 * 60, topic: topicsForDay[1] },
  ];
  const created = [];
  for (const slot of slots) {
    if (clock.minute < slot.minute) continue;
    const id = advisorTipId(userId, clock.day, slot.key);
    if (await db.notification.findUnique({ where: { id } })) continue;
    const content = await getOrCreateTipContent(db, {
      tenantId,
      day: clock.day,
      slot: slot.key,
      businessType: tenant?.businessType,
      welcome: welcomeDay !== null,
      topic: slot.topic,
    }, generateTip);
    const titlePrefix = welcomeDay !== null && slot.key === 'morning' ? 'Welcome tip' : 'Advisor tip';
    const notification = {
      id, tenantId, userId, channel: 'in_app', title: `${titlePrefix}: ${content.title}`,
      message: content.message, type: 'advisor_tip', isRead: false,
      metadata: { topic: content.title, tipDate: clock.day, reminderSlot: slot.key, businessType: tenant?.businessType || 'other', welcome: welcomeDay !== null, link: '/tenant/ai-advisor' },
    };
    await db.notification.createMany({ data: [notification], skipDuplicates: true });
    const saved = await db.notification.findUnique({ where: { id } });
    if (saved) created.push(saved);
  }
  return { date: clock.day, timeZone: clock.timeZone, created };
}
