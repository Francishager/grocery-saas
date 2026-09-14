// Search queries come from this public topic catalogue, never from private business/customer text.
const topics = [
  { match: /\b(invest(?:ment|ing)?|capital|expansion|expand|equipment|roi|npv|payback)\b/i, query: 'business investment capital budgeting cash flow risk payback', titles: ['Capital budgeting', 'Payback period'] },
  { match: /\b(design|graphic|flyer|poster|branding|typography|creative)\b/i, query: 'graphic design visual hierarchy typography marketing', titles: ['Graphic design', 'Typography'] },
  { match: /\b(hr|staff|employee|hiring|retention|attendance|payroll|salary|team)\b/i, query: 'human resource management employee retention small business', titles: ['Human resource management', 'Employee retention'] },
  { match: /\b(credit|repay|repayment|debt|balance|cash|profit|finance)\b/i, query: 'small business accounts receivable cash flow management', titles: ['Cash flow management', 'Accounts receivable'] },
  { match: /\b(stock|inventory|supply|supplier|product|restock)\b/i, query: 'small business inventory management demand planning', titles: ['Inventory management', 'Demand forecasting'] },
  { match: /\b(price|pricing|discount|margin)\b/i, query: 'small business pricing strategies contribution margin', titles: ['Pricing strategies', 'Contribution margin'] },
  { match: /\b(marketing|sales|growth|customer|promot|strategy)\b/i, query: 'small business marketing strategy customer retention', titles: ['Marketing strategy', 'Customer retention'] },
];
export function researchTopic(question) { return topics.find(topic => topic.match.test(question)) || topics.at(-1); }
const safeUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; } };
export async function fetchAdvisorResearch(question, { signal, fetchImpl = fetch, searchKey = process.env.BRAVE_SEARCH_API_KEY } = {}) {
  const topic = researchTopic(question);
  const timedSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000);
  const options = { signal: timedSignal, redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': 'JibuSalesAdvisor/1.0 (business research)' } };
  try {
    if (searchKey) {
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.search = new URLSearchParams({ q: topic.query, count: '5', safesearch: 'strict' }).toString();
      const response = await fetchImpl(url, { ...options, headers: { ...options.headers, 'X-Subscription-Token': searchKey } });
      if (response.ok) {
        const data = await response.json();
        const sources = (data.web?.results || []).map(item => ({ title: String(item.title || '').slice(0, 180), url: safeUrl(item.url), excerpt: String(item.description || '').replace(/<[^>]*>/g, '').slice(0, 1600) })).filter(item => item.url && item.excerpt).slice(0, 5);
        if (sources.length) return { status: 'available', kind: 'web-search', retrievedAt: new Date().toISOString(), sources };
      }
    }
    const url = new URL('https://en.wikipedia.org/w/api.php');
    url.search = new URLSearchParams({ action: 'query', format: 'json', prop: 'extracts|info', inprop: 'url', explaintext: '1', exintro: '1', exchars: '1800', titles: topic.titles.join('|'), redirects: '1' }).toString();
    const response = await fetchImpl(url, options);
    if (!response.ok) throw new Error('Research unavailable');
    const data = await response.json();
    const sources = Object.values(data.query?.pages || {}).map(page => ({ title: page.title, url: safeUrl(page.fullurl), excerpt: page.extract?.slice(0, 1800) })).filter(page => page.url && page.excerpt);
    return { status: sources.length ? 'available' : 'unavailable', kind: 'business-reference', retrievedAt: new Date().toISOString(), sources };
  } catch {
    return { status: 'unavailable', sources: [], notice: 'External research could not be retrieved. Advice is based on available business data and general knowledge, not verified current market information.' };
  }
}
