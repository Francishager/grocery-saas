const topics = [
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

export function advisorTipTopics(dayOrdinal) {
  const morning = ((dayOrdinal * 7) % topics.length + topics.length) % topics.length;
  const afternoon = (morning + 5) % topics.length;
  return [topics[morning], topics[afternoon]];
}

export function advisorTipId(userId, day, slot) {
  return `advisor-tip:${userId}:${day}:${slot}`;
}

export async function deliverDueAdvisorTips(db, req, now = new Date()) {
  const tenantId = req.user.tenantId || req.user.tenant_id || req.user.business_id;
  const userId = req.user.id;
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
  const clock = localClock(now, tenant?.timezone || 'Africa/Kampala');
  const topicsForDay = advisorTipTopics(clock.ordinal);
  const slots = [
    { key: 'morning', minute: 9 * 60, topic: topicsForDay[0] },
    { key: 'afternoon', minute: 15 * 60, topic: topicsForDay[1] },
  ];
  const created = [];
  for (const slot of slots) {
    if (clock.minute < slot.minute) continue;
    const id = advisorTipId(userId, clock.day, slot.key);
    if (await db.notification.findUnique({ where: { id } })) continue;
    const notification = {
      id, tenantId, userId, channel: 'in_app', title: `Advisor tip: ${slot.topic[0]}`,
      message: slot.topic[1], type: 'advisor_tip', isRead: false,
      metadata: { topic: slot.topic[0], tipDate: clock.day, reminderSlot: slot.key, link: '/tenant/ai-advisor' },
    };
    await db.notification.createMany({ data: [notification], skipDuplicates: true });
    const saved = await db.notification.findUnique({ where: { id } });
    if (saved) created.push(saved);
  }
  return { date: clock.day, timeZone: clock.timeZone, created };
}
