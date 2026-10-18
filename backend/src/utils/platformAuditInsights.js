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
  const pageViews = new Map();
  const pagesByHour = Array.from({ length: 24 }, () => new Map());
  const tenantFeatureStats = new Map();
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

      const tenantFeatureKey = `${log.tenantId}:${feature.toLowerCase()}`;
      const tenantStats = tenantFeatureStats.get(tenantFeatureKey) || {
        tenantId: log.tenantId, feature, count: 0, activeMs: 0, interactionCount: 0, maxScrollDepth: 0,
      };
      if (!featureVisits.has(`${visitKey}:tenant`)) {
        featureVisits.add(`${visitKey}:tenant`);
        tenantStats.count += 1;
      }
      tenantStats.activeMs += Math.max(0, Number(metrics.activeMs) || 0);
      tenantStats.interactionCount += Math.max(0, Number(metrics.interactionCount) || 0);
      tenantStats.maxScrollDepth = Math.max(tenantStats.maxScrollDepth, Math.min(100, Number(metrics.maxScrollDepth) || 0));
      tenantFeatureStats.set(tenantFeatureKey, tenantStats);
    }

    byAction.set(log.action, (byAction.get(log.action) || 0) + 1);
    const hour = byHour[Number(localTime.hour)];
    hour.count += 1;
    if (isFeatureUsage) {
      const metrics = log.changes && typeof log.changes === 'object' ? log.changes : {};
      hour.pageViews += log.action === 'view' ? 1 : 0;
      hour.activeMs += Math.max(0, Number(metrics.activeMs) || 0);
      hour.interactionCount += Math.max(0, Number(metrics.interactionCount) || 0);
      if (log.action === 'view') {
        pageViews.set(feature, (pageViews.get(feature) || 0) + 1);
        const pages = pagesByHour[Number(localTime.hour)];
        pages.set(feature, (pages.get(feature) || 0) + 1);
      }
    }
    byDay.set(localDay, (byDay.get(localDay) || 0) + 1);
  }

  return {
    featureRankingRule: 'All features, including Dashboard; rank by visible active time, then interactions, then distinct business-user-days. Time pauses while hidden or idle.',
    byFeature: [...featureStats.values()].sort((a, b) => b.activeMs - a.activeMs || b.interactionCount - a.interactionCount || b.count - a.count).slice(0, 12),
    byAction: [...byAction].map(([action, count]) => ({ action, count })).sort((a, b) => b.count - a.count),
    byHour: byHour.map((item, hour) => ({
      ...item,
      topPages: [...pagesByHour[hour]].map(([page, views]) => ({ page, views })).sort((a, b) => b.views - a.views || a.page.localeCompare(b.page)).slice(0, 8),
    })),
    byPage: [...pageViews].map(([page, views]) => ({ page, views })).sort((a, b) => b.views - a.views || a.page.localeCompare(b.page)).slice(0, 20),
    byBusiness: [...new Set([...tenantFeatureStats.values()].map(item => item.tenantId))].map(tenantId => {
      const allFeatures = [...tenantFeatureStats.values()].filter(item => item.tenantId === tenantId)
        .sort((a, b) => b.activeMs - a.activeMs || b.interactionCount - a.interactionCount || b.count - a.count);
      return {
        tenantId,
        tenantName: '',
        activeMs: allFeatures.reduce((sum, item) => sum + item.activeMs, 0),
        interactionCount: allFeatures.reduce((sum, item) => sum + item.interactionCount, 0),
        features: allFeatures.slice(0, 5),
      };
    }).sort((a, b) => b.activeMs - a.activeMs || b.interactionCount - a.interactionCount).slice(0, 30),
    byDay: [...byDay].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}
