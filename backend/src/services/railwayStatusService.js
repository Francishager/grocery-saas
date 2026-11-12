const RAILWAY_STATUS_URL = 'https://api.railwaystatus.com/status';
const CACHE_TTL_MS = 60_000;
const STALE_TTL_MS = 10 * 60_000;

function safeText(value, maxLength = 240) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function flattenComponents(components, parents = []) {
  if (!Array.isArray(components)) return [];
  return components.flatMap(component => {
    const name = safeText(component?.name, 100);
    const path = name ? [...parents, name] : parents;
    if (Array.isArray(component?.components)) return flattenComponents(component.components, path);
    const status = safeText(component?.status, 40).toUpperCase();
    return name && status ? [{ name: path.join(' / '), status }] : [];
  });
}

function normalizeSummary(summary, checkedAt) {
  const components = flattenComponents(summary?.components);
  if (!components.length || !Array.isArray(summary?.incidents) || !Array.isArray(summary?.maintenances)) {
    throw new Error('Railway status response was incomplete.');
  }

  const incidents = summary.incidents.slice(0, 5).map(incident => ({
    name: safeText(incident?.name || incident?.title, 160) || 'Railway incident',
    status: safeText(incident?.status, 40),
    impact: safeText(incident?.impact, 40),
    updatedAt: safeText(incident?.updatedAt || incident?.updated_at, 40) || null,
    components: (Array.isArray(incident?.components) ? incident.components : [])
      .map(component => safeText(component?.name, 100)).filter(Boolean).slice(0, 5),
  }));

  const affectedComponents = components
    .filter(component => !['OPERATIONAL', 'NORMAL', 'UP'].includes(component.status))
    .slice(0, 8);

  const scheduledMaintenances = summary.maintenances.slice(0, 3)
    .map(item => ({
      name: safeText(item?.name || item?.title, 160) || 'Scheduled maintenance',
      status: safeText(item?.status, 40),
      startsAt: safeText(item?.scheduledFor || item?.scheduled_for || item?.startsAt, 40) || null,
      endsAt: safeText(item?.scheduledUntil || item?.scheduled_until || item?.endsAt, 40) || null,
    }));

  const status = incidents.length || affectedComponents.length ? 'degraded' : 'operational';
  const description = incidents.length
    ? `${incidents.length} active Railway incident${incidents.length === 1 ? '' : 's'}`
    : affectedComponents.length
      ? `${affectedComponents.length} Railway component${affectedComponents.length === 1 ? '' : 's'} affected`
      : 'All reported Railway components operational';

  return {
    status,
    description,
    indicator: status === 'operational' ? 'none' : 'degraded',
    checkedAt,
    incidents,
    affectedComponents,
    scheduledMaintenances,
    sourceUrl: 'https://status.railway.com/',
  };
}

export function createRailwayStatusService({
  fetchImpl = fetch,
  now = Date.now,
  cacheTtlMs = CACHE_TTL_MS,
  staleTtlMs = STALE_TTL_MS,
} = {}) {
  let cached = null;

  return async function getRailwayStatus() {
    const currentTime = now();
    if (cached && currentTime - cached.fetchedAt < cacheTtlMs) {
      return { ...cached.data, stale: false };
    }

    try {
      const response = await fetchImpl(RAILWAY_STATUS_URL, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`Railway status returned HTTP ${response.status}.`);
      const data = normalizeSummary(await response.json(), new Date(currentTime).toISOString());
      cached = { data, fetchedAt: currentTime };
      return { ...data, stale: false };
    } catch {
      if (cached && currentTime - cached.fetchedAt <= staleTtlMs) {
        return { ...cached.data, stale: true };
      }
      return {
        status: 'unavailable',
        description: 'Railway status could not be checked right now.',
        indicator: 'unknown',
        checkedAt: new Date(currentTime).toISOString(),
        incidents: [],
        affectedComponents: [],
        scheduledMaintenances: [],
        sourceUrl: 'https://status.railway.com/',
        stale: true,
      };
    }
  };
}

export const getRailwayStatus = createRailwayStatusService();
