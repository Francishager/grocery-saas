(function(){
  const API_URL = (window.App && App.API_URL) ? App.API_URL : window.location.origin;

  // Deduplicate in-flight requests by cacheKey
  const inflight = new Map(); // key -> Promise

  function buildUrl(path, params){
    const url = new URL(path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`);
    if (params && typeof params === 'object') {
      Object.entries(params).forEach(([k,v])=>{
        if (v === undefined || v === null || v === '') return;
        url.searchParams.set(k, v);
      });
    }
    return url.toString();
  }

  function authHeader(){
    try { return (window.Store?.get()?.token) ? { Authorization: `Bearer ${window.Store.get().token}` } : {}; } catch { return {}; }
  }

  function getCacheKey(method, url, body){
    return `${method}:${url}:${body ? JSON.stringify(body) : ''}`;
  }

  async function handleResponse(res){
    const contentType = res.headers.get('content-type') || '';
    const parseJson = contentType.includes('application/json');
    const data = parseJson ? await res.json().catch(()=>({})) : await res.text();
    if (!res.ok){
      if (res.status === 401){
        try { window.Store?.set({ token: '', user: null }); } catch {}
        try { window.location.href = 'index.html'; } catch {}
      }
      const err = new Error(data?.error || data?.message || `HTTP ${res.status}`);
      err.status = res.status; err.data = data; throw err;
    }
    return data;
  }

  async function request(method, path, { params, body, headers, ttl = 30000, cacheKey, skipCache = false } = {}){
    const url = buildUrl(path, params);
    const key = cacheKey || getCacheKey(method, url, body);

    if (!skipCache){
      const cached = window.Store?.getCache?.(key);
      if (cached !== undefined && cached !== null) return cached;
      if (inflight.has(key)) return inflight.get(key);
    }

    const fetchPromise = fetch(url, {
      method,
      headers: {
        'Accept': 'application/json',
        ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
        ...authHeader(),
        ...(headers || {})
      },
      body: (method === 'GET' || body == null) ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
    }).then(handleResponse).then(data => {
      try { if (!skipCache && ttl > 0) window.Store?.setCache?.(key, data, ttl); } catch {}
      inflight.delete(key);
      return data;
    }).catch(err => { inflight.delete(key); throw err; });

    inflight.set(key, fetchPromise);
    return fetchPromise;
  }

  function get(path, opts){ return request('GET', path, opts); }
  function post(path, opts){ return request('POST', path, opts); }
  function patch(path, opts){ return request('PATCH', path, opts); }
  function del(path, opts){ return request('DELETE', path, opts); }

  async function query(key, fetcher, { ttl = 30000, force = false } = {}){
    if (!force){
      const cached = window.Store?.getCache?.(key);
      if (cached !== undefined && cached !== null) return cached;
    }
    const p = Promise.resolve().then(fetcher);
    const data = await p;
    try { if (ttl > 0) window.Store?.setCache?.(key, data, ttl); } catch {}
    return data;
  }

  function invalidate(prefix){ try { window.Store?.invalidateCache?.(prefix); } catch {} }
  function prefetch(path, opts){ return get(path, opts).catch(()=>undefined); }

  const API = { get, post, patch, delete: del, request, query, invalidate, prefetch, buildUrl };
  if (!window.App) window.App = {};
  window.API = API; window.App.API = API;
})();
