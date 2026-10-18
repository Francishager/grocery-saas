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
  const featureCounts = new Map();
  const byAction = new Map();
  const byHour = Array.from({ length: 24 }, () => 0);
  const byDay = new Map();

  for (const log of logs) {
    const localTime = Object.fromEntries(KAMPALA_FORMATTER.formatToParts(log.createdAt).map(({ type, value }) => [type, value]));
    const localDay = `${localTime.year}-${localTime.month}-${localTime.day}`;
    const feature = String(log.model || 'Other').trim();

    if (log.action === 'view' && feature && feature.toLowerCase() !== 'dashboard') {
      const visitKey = `${log.tenantId}:${log.userId}:${feature.toLowerCase()}:${localDay}`;
      if (!featureVisits.has(visitKey)) {
        featureVisits.add(visitKey);
        featureCounts.set(feature, (featureCounts.get(feature) || 0) + 1);
      }
    }

    byAction.set(log.action, (byAction.get(log.action) || 0) + 1);
    byHour[Number(localTime.hour)] += 1;
    byDay.set(localDay, (byDay.get(localDay) || 0) + 1);
  }

  return {
    featureRankingRule: 'Dashboard excluded; each feature counts once per business, user, and Kampala calendar day.',
    byFeature: [...featureCounts].map(([feature, count]) => ({ feature, count })).sort((a, b) => b.count - a.count).slice(0, 12),
    byAction: [...byAction].map(([action, count]) => ({ action, count })).sort((a, b) => b.count - a.count),
    byHour: byHour.map((count, hour) => ({ hour, count })),
    byDay: [...byDay].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}
