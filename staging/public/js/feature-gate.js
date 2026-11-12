(function(){
  // Lightweight feature gate that does not depend on App.API
  function getToken(){ try { return (window.App?.Store?.get()?.token) || localStorage.getItem('token') || ''; } catch { return ''; } }
  function getUser(){ try { return (window.App?.Store?.get()?.user) || JSON.parse(localStorage.getItem('user')||'null'); } catch { return null; } }
  function apiBase(){
    try { return (window.APP_CONFIG && window.APP_CONFIG.API_URL) ? window.APP_CONFIG.API_URL : window.location.origin; } catch { return window.location.origin; }
  }
  async function fetchFeatures(){
    const t = getToken(); if (!t) return [];
    try{
      const r = await fetch(`${apiBase()}/me/features`, { headers: { Authorization: `Bearer ${t}` } });
      const j = await r.json(); if (!r.ok) throw new Error(j.error||'Failed to fetch features');
      return Array.isArray(j.features) ? j.features : [];
    }catch(e){ console.warn('feature-gate: fetch error', e?.message); return []; }
  }
  function hasAny(features, codes){
    if (!Array.isArray(features)) features = [];
    const set = new Set(features.map(String));
    if (set.has('all')) return true;
    for (const c of codes){ if (set.has(String(c))) return true; }
    return false;
  }
  function applyDom(features){
    // Hide elements with data-feature="a" or comma list (OR)
    document.querySelectorAll('[data-feature]')?.forEach(el=>{
      const expr = (el.getAttribute('data-feature')||'').trim();
      if (!expr) return;
      const codes = expr.split(',').map(s=>s.trim()).filter(Boolean);
      if (!hasAny(features, codes)) el.classList.add('d-none'); else el.classList.remove('d-none');
    });
    // Enforce page-level requirement
    const reqExpr = document.body?.getAttribute('data-require-feature') || '';
    const req = reqExpr.split(',').map(s=>s.trim()).filter(Boolean);
    if (req.length && !hasAny(features, req)){
      // show minimal message and redirect
      try { document.body.innerHTML = '<div class="container py-5"><div class="alert alert-warning">You do not have access to this section.</div></div>'; } catch {}
      try { setTimeout(()=>{ window.location.href = 'dashboard.html'; }, 900); } catch {}
    }
  }

  async function init(){
    const user = getUser();
    if (!user) return; // not logged in, skip
    const features = await fetchFeatures();
    try { if (window.App && App.Store) App.Store.set({ features }); } catch {}
    // If ACL present, rebuild ability and apply; else do simple gate
    try {
      if (window.App && App.ACL){
        const ability = App.ACL.defineAbility(user, features);
        App.ability = ability; App.ACL.applyDomPermissions(ability, document);
      } else {
        applyDom(features);
      }
    } catch(e){ console.warn('feature-gate apply failed', e); applyDom(features); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
