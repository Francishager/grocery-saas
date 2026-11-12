(function(){
  // Lightweight global store for vanilla JS apps
  // Usage: Store.get(), Store.set(partial), Store.subscribe(fn), Store.on('key', fn)
  const listeners = new Set();
  const keyListeners = new Map(); // key -> Set fns

  const initial = {
    user: (function(){ try { return JSON.parse(localStorage.getItem('user')||'null'); } catch { return null; } })(),
    token: localStorage.getItem('token') || '',
    features: [], // e.g., ['reports', 'inventory']
    // simple in-memory cache for API responses
    cache: new Map(), // key -> { value, expiresAt }
  };

  let state = { ...initial };

  function notify(changedKeys){
    // global listeners
    listeners.forEach(fn => { try { fn(state, changedKeys); } catch(e){ console.error('Store listener error:', e); } });
    // per-key listeners
    (changedKeys||[]).forEach(k => {
      const set = keyListeners.get(k);
      if (set) set.forEach(fn=>{ try { fn(state[k], state); } catch(e){ console.error('Store key listener error:', e); } });
    });
  }

  function set(partial){
    const next = { ...state, ...(typeof partial === 'function' ? partial(state) : partial) };
    const changedKeys = Object.keys(next).filter(k => state[k] !== next[k]);
    state = next;
    // Persist known auth keys
    if (changedKeys.includes('token')) {
      if (state.token) localStorage.setItem('token', state.token); else localStorage.removeItem('token');
    }
    if (changedKeys.includes('user')) {
      if (state.user) localStorage.setItem('user', JSON.stringify(state.user)); else localStorage.removeItem('user');
    }
    notify(changedKeys);
    return state;
  }

  function get(){ return state; }

  function select(selector){
    try { return selector(state); } catch { return undefined; }
  }

  function subscribe(fn){ listeners.add(fn); return () => listeners.delete(fn); }
  function on(key, fn){
    if (!keyListeners.has(key)) keyListeners.set(key, new Set());
    keyListeners.get(key).add(fn);
    return () => { const set = keyListeners.get(key); if (set) set.delete(fn); };
  }

  function setCache(key, value, ttlMs){
    const expiresAt = ttlMs ? (Date.now() + ttlMs) : 0;
    const entry = { value, expiresAt };
    // Avoid mutating state directly; clone Map
    const newCache = new Map(state.cache);
    newCache.set(key, entry);
    set({ cache: newCache });
    return entry;
  }

  function getCache(key){
    const entry = state.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      // expired; remove
      const newCache = new Map(state.cache);
      newCache.delete(key);
      set({ cache: newCache });
      return null;
    }
    return entry.value;
  }

  function invalidateCache(prefix){
    const newCache = new Map();
    for (const [k, v] of state.cache.entries()){
      if (!prefix || !String(k).startsWith(prefix)) newCache.set(k, v);
    }
    set({ cache: newCache });
  }

  const Store = { get, set, select, subscribe, on, setCache, getCache, invalidateCache };
  if (!window.App) window.App = {};
  window.Store = Store;
  window.App.Store = Store;
})();
