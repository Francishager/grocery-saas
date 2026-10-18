const KAMPALA_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Kampala',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

export function summarizePlatformAudit(logs) {
  const featureVisits = new Set();
  const featureStats = new Map();
  const byAction = new Map();
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0, pageViews: 0, activeMs: 0, interactionCount: 0 }));
  const byDay = new Map();

  for (const log of logs) {
    const localTime = Object.fromEntries(KAMPALA_FORMATTER.formatToParts(log.createdAt).map(({ type, value }) => [type, value]));
    const localDay = `${localTime.year}-${localTime.month}-${localTime.day}`;
    const isFeatureUsage = log.action === 'view' || log.action === 'engagement';
    const feature = String(log.model || 'Other').trim();
    if (isFeatureUsage && feature) {
      const stats = featureStats.get(feature) || { feature, count: 0, activeMs: 0, interactionCount: 0, maxScrollDepth: 0 };
      const visitKey = `${log.tenantId}:${log.userId}:${feature.toLowerCase()}:${localDay}`;
      if (!featureVisits.has(visitKey)) {
        featureVisits.add(visitKey);
        stats.count += 1;
      }
      const metrics = log.changes && typeof log.changes === 'object' ? log.changes : {};
      stats.activeMs += Math.max(0, Number(metrics.activeMs) || 0);
      stats.interactionCount += Math.max(0, Number(metrics.interactionCount) || 0);
      stats.maxScrollDepth = Math.max(stats.maxScrollDepth, Math.min(100, Number(metrics.maxScrollDepth) || 0));
      featureStats.set(feature, stats);
    }

    byAction.set(log.action, (byAction.get(log.action) || 0) + 1);
    const hour = byHour[Number(localTime.hour)];
    hour.count += 1;
    if (isFeatureUsage) {
      const metrics = log.changes && typeof log.changes === 'object' ? log.changes : {};
      hour.pageViews += log.action === 'view' ? 1 : 0;
      hour.activeMs += Math.max(0, Number(metrics.activeMs) || 0);
      hour.interactionCount += Math.max(0, Number(metrics.interactionCount) || 0);
    }
    byDay.set(localDay, (byDay.get(localDay) || 0) + 1);
  }

  return {
    featureRankingRule: 'All features, including Dashboard; rank by visible active time, then interactions, then distinct business-user-days. Time pauses while hidden or idle.',
    byFeature: [...featureStats.values()].sort((a, b) => b.activeMs - a.activeMs || b.interactionCount - a.interactionCount || b.count - a.count).slice(0, 12),
    byAction: [...byAction].map(([action, count]) => ({ action, count })).sort((a, b) => b.count - a.count),
    byHour,
    byDay: [...byDay].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}
