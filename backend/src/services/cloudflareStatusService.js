const CLOUDFLARE_STATUS_URL = 'https://www.cloudflarestatus.com/api/v2/summary.json';
const DEFAULT_FRONTEND_URL = 'https://jibusales.jibusales00.workers.dev';
const CACHE_TTL_MS = 60_000;
const STALE_TTL_MS = 10 * 60_000;

function safeText(value, maxLength = 240) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeSummary(summary, checkedAt) {
  const indicator = safeText(summary?.status?.indicator, 40).toLowerCase();
  const description = safeText(summary?.status?.description, 160);
  if (!indicator || !description || !Array.isArray(summary?.components)) {
    throw new Error('Cloudflare status response was incomplete.');
  }

  const affectedComponents = summary.components
    .filter(component => component?.status && component.status !== 'operational')
    .map(component => ({ name: safeText(component.name, 100), status: safeText(component.status, 40) }))
    .filter(component => component.name)
    .slice(0, 8);

  const incidents = (Array.isArray(summary.incidents) ? summary.incidents : []).slice(0, 5).map(incident => ({
    name: safeText(incident?.name, 160) || 'Cloudflare incident',
    status: safeText(incident?.status, 40),
    impact: safeText(incident?.impact, 40),
    updatedAt: safeText(incident?.updated_at, 40) || null,
    components: (Array.isArray(incident?.components) ? incident.components : [])
      .map(component => safeText(component?.name, 100)).filter(Boolean).slice(0, 5),
  }));

  const scheduledMaintenances = (Array.isArray(summary.scheduled_maintenances) ? summary.scheduled_maintenances : [])
    .filter(item => !['completed', 'cancelled'].includes(String(item?.status || '').toLowerCase()))
    .slice(0, 3)
    .map(item => ({
      name: safeText(item?.name, 160) || 'Scheduled maintenance',
      status: safeText(item?.status, 40),
      startsAt: safeText(item?.scheduled_for, 40) || null,
      endsAt: safeText(item?.scheduled_until, 40) || null,
    }));

  return {
    status: indicator === 'none' ? 'operational' : 'degraded',
    description,
    indicator,
    checkedAt,
    incidents,
    affectedComponents,
    scheduledMaintenances,
    sourceUrl: 'https://www.cloudflarestatus.com/',
  };
}

async function probeFrontend(fetchImpl, frontendUrl) {
  const startedAt = performance.now();
  try {
    let response = await fetchImpl(frontendUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'JibuSales-Platform-Health/1.0' },
    });
    if (response.status === 405) {
      response = await fetchImpl(frontendUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'JibuSales-Platform-Health/1.0', Range: 'bytes=0-0' },
      });
    }
    const result = {
      status: response.ok ? 'reachable' : 'unreachable',
      httpStatus: response.status,
      latencyMs: Math.round(performance.now() - startedAt),
      url: frontendUrl,
    };
    await response.body?.cancel().catch(() => {});
    return result;
  } catch {
    return { status: 'unreachable', httpStatus: null, latencyMs: Math.round(performance.now() - startedAt), url: frontendUrl };
  }
}

export function createCloudflareStatusService({
  fetchImpl = fetch,
  now = Date.now,
  frontendUrl = process.env.CLOUDFLARE_FRONTEND_URL || process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL,
  cacheTtlMs = CACHE_TTL_MS,
  staleTtlMs = STALE_TTL_MS,
} = {}) {
  let cached = null;

  return async function getCloudflareStatus() {
    const currentTime = now();
    if (cached && currentTime - cached.fetchedAt < cacheTtlMs) {
      return { ...cached.data, stale: false };
    }

    const [summaryResult, frontend] = await Promise.allSettled([
      (async () => {
        const response = await fetchImpl(CLOUDFLARE_STATUS_URL, {
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'JibuSales-Platform-Health/1.0' },
        });
        if (!response.ok) throw new Error(`Cloudflare status returned HTTP ${response.status}.`);
        return normalizeSummary(await response.json(), new Date(currentTime).toISOString());
      })(),
      probeFrontend(fetchImpl, frontendUrl),
    ]);

    let provider = summaryResult.status === 'fulfilled' ? summaryResult.value : null;
    let stale = false;
    if (provider) {
      cached = { data: provider, fetchedAt: currentTime };
    } else if (cached && currentTime - cached.fetchedAt <= staleTtlMs) {
      provider = cached.data;
      stale = true;
    }

    if (!provider) {
      provider = {
        status: 'unavailable',
        description: 'Cloudflare platform status could not be checked.',
        indicator: 'unknown',
        checkedAt: new Date(currentTime).toISOString(),
        incidents: [],
        affectedComponents: [],
        scheduledMaintenances: [],
        sourceUrl: 'https://www.cloudflarestatus.com/',
      };
      stale = true;
    }

    const frontendCheck = frontend.status === 'fulfilled'
      ? frontend.value
      : { status: 'unreachable', httpStatus: null, latencyMs: null, url: frontendUrl };
    const status = frontendCheck.status === 'unreachable' || provider.status === 'degraded'
      ? 'degraded'
      : provider.status === 'unavailable' ? 'unavailable' : 'operational';

    return {
      ...provider,
      status,
      frontend: frontendCheck,
      stale,
    };
  };
}

export const getCloudflareStatus = createCloudflareStatusService();
