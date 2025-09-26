 (function(){
  const root = window.App || (window.App = {});
  const Admin = root.Admin || (root.Admin = {});
  let planModal;
  let featureList = []; // cache of all features
  const planMaps = new Map(); // planId -> [{id, subscription_id, feature_id, limit_value}]
  
  async function fetchAllFeatures(){
    if (featureList.length) return featureList;
    const load = async()=>{
      const r = await fetch(`${root.API_URL||window.location.origin}/admin/crud/Features`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      const j = await r.json(); if (!r.ok) throw new Error(j.error||'Features load failed'); 
      return j;
    };
    let items = await load();
    try {
      const catalog = root.FeatureCatalog || (window.App && window.App.FeatureCatalog);
      const ensureSeed = window.App?.Admin?.Features?.ensureCatalogSeed;
      if (Array.isArray(catalog) && typeof ensureSeed === 'function'){
        const want = new Set(catalog.flatMap(cat => (cat.items||[]).map(it=>String(it.code))));
        const have = new Set((items||[]).map(f=>String(f.code||'')));
        let missing = false;
        for (const c of want){ if (!have.has(c)) { missing = true; break; } }
        if (missing){ await ensureSeed(); items = await load(); }
      }
    } catch (e){ console.warn('Feature seed check failed:', e); }
    featureList = Array.isArray(items) ? items : [];
    return featureList;
  }


async function fetchPlanMaps(planId){
  if (!planId) return [];
  if (planMaps.has(planId)) return planMaps.get(planId);
  if (root.API) {
    const maps = await root.API.get('/admin/crud/Subscription_Features', { ttl: 10000 });
    const filtered = (maps||[]).filter(m=>String(m.subscription_id)===String(planId));
    planMaps.set(planId, filtered); return filtered;
  }
  const resp = await fetch(`${root.API_URL||window.location.origin}/admin/crud/Subscription_Features`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
  const j = await resp.json(); if (!resp.ok) throw new Error(j.error || 'Map load failed');
  const filtered = (j||[]).filter(m=>String(m.subscription_id)===String(planId));
  planMaps.set(planId, filtered); return filtered;
}

  function renderPlanFeatureList(planId, feats, maps){
    const wrap = document.getElementById('planFeatureList'); if (!wrap) return;
    const byFeatId = new Set((maps||[]).map(m=>String(m.feature_id)));
    const catalog = root.FeatureCatalog || (window.App && window.App.FeatureCatalog);
    if (!Array.isArray(catalog) || !catalog.length){
      // Fallback: flat list
      wrap.innerHTML = (feats||[]).map(f=>{
        const fid = f.id; const checked = byFeatId.has(String(fid)) ? 'checked' : '';
        return `<div class="col-12 col-sm-6"><div class="form-check">
          <input class="form-check-input" type="checkbox" data-plan-feature-id="${fid}" ${checked} id="pf_${planId||'new'}_${fid}">
          <label class="form-check-label" for="pf_${planId||'new'}_${fid}">${f.name||''} <small class="text-muted">${f.code||''}</small></label>
        </div></div>`;
      }).join('') || '<div class="text-muted small">No features yet</div>';
      return;
    }
    const byCode = new Map((feats||[]).map(f=>[String(f.code||''), f]));
    const usedIds = new Set();
    const sections = catalog.map(cat=>{
      const items = (cat.items||[]).map(it=>{
        const f = byCode.get(String(it.code)); if (!f) return '';
        usedIds.add(String(f.id));
        const checked = byFeatId.has(String(f.id)) ? 'checked' : '';
        return `<div class="col-12 col-sm-6"><div class="form-check">
          <input class="form-check-input" type="checkbox" data-plan-feature-id="${f.id}" ${checked} id="pf_${planId||'new'}_${f.id}">
          <label class="form-check-label" for="pf_${planId||'new'}_${f.id}">${it.name} <small class="text-muted">${it.code}</small> <span class="badge bg-secondary ms-2">${cat.label}</span></label>
        </div></div>`;
      }).filter(Boolean).join('');
      if (!items) return '';
      return `<div class="col-12"><h6 class="mb-2 mt-2">${cat.label}</h6><div class="row g-2">${items}</div></div>`;
    }).filter(Boolean);
    // Add any remaining features not in catalog under Other
    const leftovers = (feats||[]).filter(f=>!usedIds.has(String(f.id)));
    if (leftovers.length){
      const others = leftovers.map(f=>{
        const checked = byFeatId.has(String(f.id)) ? 'checked' : '';
        const nm = (typeof f.name === 'string' && f.name.startsWith('enc:v1:')) ? `Feature #${f.id}` : (f.name||'');
        const cdRaw = (typeof f.code === 'string') ? f.code : '';
        const cd = cdRaw && cdRaw.startsWith('enc:v1:') ? '' : cdRaw;
        const codeHtml = cd ? ` <small class="text-muted">${cd}</small>` : '';
        return `<div class="col-12 col-sm-6"><div class="form-check">
          <input class="form-check-input" type="checkbox" data-plan-feature-id="${f.id}" ${checked} id="pf_${planId||'new'}_${f.id}">
          <label class="form-check-label" for="pf_${planId||'new'}_${f.id}">${nm}${codeHtml} <span class=\"badge bg-secondary ms-2\">Other</span></label>
        </div></div>`;
      }).join('');
      sections.push(`<div class="col-12"><h6 class="mb-2 mt-2">Other</h6><div class="row g-2">${others}</div></div>`);
    }
    wrap.innerHTML = sections.join('') || '<div class="text-muted small">No features yet</div>';
  }

  async function loadPlanFeatureList(planId){
    const feats = await fetchAllFeatures();
    const maps = planId ? await fetchPlanMaps(planId) : [];
    renderPlanFeatureList(planId, feats, maps);
  }

  async function savePlanFeatureMappings(planId){
    if (!planId) return; // cannot map without id
    const feats = await fetchAllFeatures();
    const existing = await fetchPlanMaps(planId);
    const existingByFeat = new Map(existing.map(m=>[String(m.feature_id), m]));
    const checkedIds = Array.from(document.querySelectorAll('[data-plan-feature-id]')).filter(cb=>cb.checked).map(cb=>cb.getAttribute('data-plan-feature-id'));
    const checkedSet = new Set(checkedIds.map(String));
    const ops = [];
    // create new for checked not existing
    for (const f of feats){
      const fid = String(f.id);
      const has = existingByFeat.has(fid);
      const want = checkedSet.has(fid);
      if (want && !has) ops.push({ a:'c', p:{ subscription_id:Number(planId), feature_id:Number(fid), limit_value:null } });
      if (!want && has) ops.push({ a:'d', id: existingByFeat.get(fid).id });
    }
    for (const op of ops){
      if (root.API){
        if (op.a==='c') await root.API.post('/admin/crud/Subscription_Features', { body: op.p });
        else if (op.a==='d') await root.API.delete(`/admin/crud/Subscription_Features/${op.id}`);
      } else {
        if (op.a==='c') await fetch(`${root.API_URL||window.location.origin}/admin/crud/Subscription_Features`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(op.p) });
        else if (op.a==='d') await fetch(`${root.API_URL||window.location.origin}/admin/crud/Subscription_Features/${op.id}`, { method:'DELETE', headers:{ Authorization:`Bearer ${localStorage.getItem('token')}` } });
      }
    }
    // refresh cache
    planMaps.delete(planId);
    await fetchPlanMaps(planId);
  }

  function setupUI(){
    const newBtn = document.getElementById('btnNewPlan');
    if (newBtn && !newBtn._bound){ newBtn._bound = true; newBtn.addEventListener('click', ()=> openForm()); }
    const saveBtn = document.getElementById('planSaveBtn');
    if (saveBtn && !saveBtn._bound){ saveBtn._bound = true; saveBtn.addEventListener('click', save); }
    const backBtn = document.getElementById('planBackBtn');
    if (backBtn && !backBtn._bound){ backBtn._bound = true; backBtn.addEventListener('click', ()=> setActiveSection('section-plans')); }
    const cancelBtn = document.getElementById('planCancelBtn');
    if (cancelBtn && !cancelBtn._bound){ cancelBtn._bound = true; cancelBtn.addEventListener('click', ()=> setActiveSection('section-plans')); }
  }

  async function loadTable(){
    try{
      const items = await (root.API ? root.API.get('/admin/crud/Subscription', { ttl: 30000 }) : (async ()=>{
        const resp = await fetch(`${root.API_URL||window.location.origin}/admin/crud/Subscription`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        const j = await resp.json(); if (!resp.ok) throw new Error(j.error || 'Failed to load plans'); return j; })());
      const tbody = document.getElementById('plansTable'); if (!tbody) return;
      if (!Array.isArray(items) || items.length===0){ tbody.innerHTML = `<tr><td colspan="7" class="text-muted">No plans yet</td></tr>`; return; }
      tbody.innerHTML = items.map(p=>{
        const active = (typeof p.is_active === 'boolean') ? (p.is_active ? 'Yes' : 'No') : '—';
        return `<tr>
          <td>${p.name||'—'}</td>
          <td>${typeof formatCurrency==='function' ? formatCurrency(p.price||0) : (p.price||0)}</td>
          <td>${p.billing_cycle||'—'}</td>
          <td>${(p.limit_max_staff ?? '—')}</td>
          <td>${(p.limit_max_branches ?? '—')}</td>
          <td>${active}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary" data-edit-plan="${p.id}" data-can="manage:all">Edit</button>
            <button class="btn btn-sm btn-outline-danger ms-1" data-del-plan="${p.id}" data-can="manage:all">Delete</button>
          </td>
        </tr>`;
      }).join('');
      if (root.ACL && root.ability) root.ACL.applyDomPermissions(root.ability, tbody);
      tbody.querySelectorAll('[data-edit-plan]').forEach(b=>b.addEventListener('click',(e)=>{
        const id = e.currentTarget.getAttribute('data-edit-plan');
        const p = items.find(x=>String(x.id)===String(id));
        openForm(p);
      }));
      tbody.querySelectorAll('[data-del-plan]').forEach(b=>b.addEventListener('click', async (e)=>{
        const id = e.currentTarget.getAttribute('data-del-plan');
        if (!confirm('Delete this plan?')) return;
        try {
          if (root.API) {
            await root.API.delete(`/admin/crud/Subscription/${id}`);
          } else {
            const r = await fetch(`${root.API_URL||window.location.origin}/admin/crud/Subscription/${id}`, { method:'DELETE', headers:{ Authorization:`Bearer ${localStorage.getItem('token')}` } });
            const dj = await r.json(); if (!r.ok) throw new Error(dj.error||'Delete failed');
          }
          showToast('Plan deleted'); loadTable(); if (Admin.Features?.loadMatrix) Admin.Features.loadMatrix();
          try { root.API?.invalidate?.('/admin/crud/Subscription'); } catch {}
        } catch (err){ showAlert(err.message, 'danger'); }
      }));
    }catch(e){ showAlert(e.message,'danger'); }
  }

  function openForm(p){
    const idEl = document.getElementById('plan_id'); if (!idEl) return;
    idEl.value = p?.id || '';
    const nameEl = document.getElementById('plan_name'); if (nameEl) nameEl.value = p?.name || '';
    const priceEl = document.getElementById('plan_price'); if (priceEl) priceEl.value = p?.price ?? '';
    const cycleEl = document.getElementById('plan_cycle'); if (cycleEl) cycleEl.value = p?.billing_cycle || 'monthly';
    const actEl = document.getElementById('plan_active'); if (actEl) actEl.checked = (typeof p?.is_active === 'boolean') ? !!p.is_active : true;
    // Plan Limits
    const limStaff = document.getElementById('plan_limit_max_staff'); if (limStaff) limStaff.value = (p?.limit_max_staff ?? '');
    const limBranches = document.getElementById('plan_limit_max_branches'); if (limBranches) limBranches.value = (p?.limit_max_branches ?? '');
    // Navigate to full-page editor
    try { if (typeof setActiveSection === 'function') setActiveSection('section-plan-editor'); } catch {}

    // Load features and plan-feature mappings for this plan only if UI exists
    try {
      if (document.getElementById('planFeatureList')) loadPlanFeatureList(p?.id);
    } catch(e){ console.warn('loadPlanFeatureList failed:', e); }
  }

  async function save(){
    try{
      const id = document.getElementById('plan_id')?.value?.trim();
      const payload = {
        name: document.getElementById('plan_name')?.value?.trim(),
        price: Number(document.getElementById('plan_price')?.value || 0),
        billing_cycle: document.getElementById('plan_cycle')?.value,
        is_active: !!document.getElementById('plan_active')?.checked,
        description: document.getElementById('plan_desc')?.value?.trim() || '',
        // Plan Limits (optional numbers)
        ...(document.getElementById('plan_limit_max_staff')?.value ? { limit_max_staff: Number(document.getElementById('plan_limit_max_staff')?.value) } : {}),
        ...(document.getElementById('plan_limit_max_branches')?.value ? { limit_max_branches: Number(document.getElementById('plan_limit_max_branches')?.value) } : {}),
      };
      let planId = id;
      if (root.API) {
        if (id) await root.API.patch(`/admin/crud/Subscription/${id}`, { body: payload });
        else {
          const created = await root.API.post('/admin/crud/Subscription', { body: payload });
          planId = created?.id || created?.ID || created?.Id || planId;
        }
      } else {
        const url = id ? `${root.API_URL||window.location.origin}/admin/crud/Subscription/${id}` : `${root.API_URL||window.location.origin}/admin/crud/Subscription`;
        const method = id ? 'PATCH' : 'POST';
        const r = await fetch(url, { method, headers: { 'Content-Type':'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(payload) });
        const dj = await r.json(); if (!r.ok) throw new Error(dj.error || 'Save failed');
        if (!id) planId = dj?.id || dj?.ID || dj?.Id || planId;
      }

      // Sync plan-feature mappings based on checkboxes (only if the checklist UI exists)
      try {
        if (document.getElementById('planFeatureList')) await savePlanFeatureMappings(planId);
      } catch (e){ console.warn('savePlanFeatureMappings failed:', e); }

      showToast('Plan saved'); loadTable(); if (Admin.Features?.loadMatrix) Admin.Features.loadMatrix();
      try { if (typeof setActiveSection === 'function') setActiveSection('section-plans'); } catch {}
      try { root.API?.invalidate?.('/admin/crud/Subscription'); } catch {}
    }catch(e){ showAlert(e.message,'danger'); }
  }

  Admin.Plans = { setupUI, loadTable, openForm, save };
})();
