(function(){
  const root = window.App || (window.App = {});
  const Admin = root.Admin || (root.Admin = {});
  let featureModal;

  // Static feature categories designed for businesses
  // Adjust labels/codes here to evolve the offering without CRUD
  const CATEGORIES = [
    {
      key: 'accounting', label: 'Accounting', items: [
        { code: 'accounting', name: 'Accounting Core' },
        { code: 'payables', name: 'Payables' },
        { code: 'receivables', name: 'Receivables' },
        { code: 'staff_tillsheets', name: 'Staff Till Sheets' },
        { code: 'transaction_accounts', name: 'Transaction Accounts' },
        { code: 'bank_accounts', name: 'Bank Accounts' },
        { code: 'cash_accounts', name: 'Cash Accounts' },
        { code: 'mobile_accounts', name: 'Mobile Money Accounts' },
      ]
    },
    {
      key: 'stock_sales', label: 'Stock & Sales', items: [
        { code: 'inventory', name: 'Inventory' },
        { code: 'sales', name: 'Sales' },
      ]
    },
    {
      key: 'reports', label: 'Reports', items: [
        { code: 'reports', name: 'Reports (All)' },
        { code: 'balance_sheet', name: 'Balance Sheet' },
        { code: 'trial_balance', name: 'Trial Balance' },
        { code: 'cash_flow', name: 'Cash Flow' },
        { code: 'sales_financial', name: 'Sales Financial' }
      ]
    }
  ];

  // Expose catalog globally for other modules (e.g., Plans)
  root.FeatureCatalog = CATEGORIES;

  function setupUI(){
    // Only wire Business Feature Overrides controls
    const loadBizBtn = document.getElementById('btnLoadBizFeatures');
    if (loadBizBtn && !loadBizBtn._bound){ loadBizBtn._bound = true; loadBizBtn.addEventListener('click', loadBusinessOverrides); }
    const saveBizBtn = document.getElementById('btnSaveBizFeatures');
    if (saveBizBtn && !saveBizBtn._bound){ saveBizBtn._bound = true; saveBizBtn.addEventListener('click', saveBusinessOverrides); }
  }

  function flattenCatalog(){
    const arr = [];
    (CATEGORIES||[]).forEach(cat=>{
      (cat.items||[]).forEach(it=> arr.push({ ...it, category: cat.key, category_label: cat.label }));
    });
    return arr;
  }

  async function ensureCatalogSeed(){
    try{
      const desired = flattenCatalog();
      // Load existing features
      const existing = await (root.API ? root.API.get('/admin/crud/Features', { ttl: 5000, skipCache: true }) : (async()=>{
        const r = await fetch(`${root.API_URL||window.location.origin}/admin/crud/Features`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        const j = await r.json(); if (!r.ok) throw new Error(j.error||'Load failed'); return j; })());
      const byCode = new Map((existing||[]).map(f=>[(f.code||'').toString(), f]));
      // Add missing features
      for (const it of desired){
        if (!byCode.has(it.code)){
          const payload = { name: it.name, code: it.code, description: `${it.category_label} feature`, is_active: true };
          if (root.API) await root.API.post('/admin/crud/Features', { body: payload });
          else {
            const rr = await fetch(`${root.API_URL||window.location.origin}/admin/crud/Features`, { method:'POST', headers: { 'Content-Type':'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(payload) });
            const jj = await rr.json(); if (!rr.ok) throw new Error(jj.error||'Seed failed');
          }
        }
      }
      try { root.API?.invalidate?.('/admin/crud/Features'); } catch {}
    }catch(e){ console.warn('ensureCatalogSeed failed:', e?.message); }
  }

  function renderCatalog(){
    const wrap = document.getElementById('featureCatalogList'); if (!wrap) return;
    const html = (CATEGORIES||[]).map(cat=>{
      const items = (cat.items||[]).map(it=> `<div class="col-12 col-sm-6 col-md-4"><div class="p-2 border rounded bg-white">${it.name} <small class="text-muted">${it.code}</small></div></div>`).join('');
      return `<div class="col-12"><h6 class="mb-2 mt-2">${cat.label}</h6><div class="row g-2">${items}</div></div>`;
    }).join('');
    wrap.innerHTML = html || '<div class="text-muted">No catalog items</div>';
  }

  function renderBizFeatureList(selected){
    const wrap = document.getElementById('bizFeatList'); if (!wrap) return;
    const sel = new Set((selected||[]).map(String));
    const html = CATEGORIES.map(cat=>{
      const items = (cat.items||[]).map(it=>{
        const checked = sel.has(it.code) ? 'checked' : '';
        return `<div class="col-12 col-sm-6 col-md-4">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="bizFeat_${it.code}" data-biz-feature="${it.code}" ${checked}>
            <label class="form-check-label" for="bizFeat_${it.code}">${it.name} <small class="text-muted">${it.code}</small></label>
          </div>
        </div>`;
      }).join('');
      return `<div class="col-12">
        <h6 class="mb-2 mt-3">${cat.label}</h6>
        <div class="row g-2">${items || '<div class="text-muted small">No items</div>'}</div>
      </div>`;
    }).join('');
    wrap.innerHTML = html || '<div class="text-muted">No features available.</div>';
  }

  async function loadBusinessOverrides(){
    try{
      const bizId = document.getElementById('bizFeatBizId')?.value?.trim();
      if (!bizId) return showAlert('Enter Business ID', 'warning');
      const overrides = await (root.API ? root.API.get(`/admin/business-feature-flags/${encodeURIComponent(bizId)}`, { ttl: 5000, skipCache: true }) : (async()=>{
        const r = await fetch(`${root.API_URL||window.location.origin}/admin/business-feature-flags/${encodeURIComponent(bizId)}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        const j = await r.json(); if (!r.ok) throw new Error(j.error||'Load failed'); return j; })());
      renderBizFeatureList(overrides?.features || []);
      showToast('Loaded business features');
    }catch(e){ showAlert(e.message,'danger'); }
  }

  async function saveBusinessOverrides(){
    try{
      const bizId = document.getElementById('bizFeatBizId')?.value?.trim();
      if (!bizId) return showAlert('Enter Business ID', 'warning');
      const checked = Array.from(document.querySelectorAll('[data-biz-feature]:checked')).map(el=>el.getAttribute('data-biz-feature'));
      const payload = { features: checked };
      if (root.API) await root.API.post(`/admin/business-feature-flags/${encodeURIComponent(bizId)}`, { body: payload });
      else {
        const r = await fetch(`${root.API_URL||window.location.origin}/admin/business-feature-flags/${encodeURIComponent(bizId)}`, { method:'POST', headers: { 'Content-Type':'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(payload) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error||'Save failed');
      }
      showToast('Business features saved');
    }catch(e){ showAlert(e.message,'danger'); }
  }
  Admin.Features = { setupUI, loadBusinessOverrides, saveBusinessOverrides, ensureCatalogSeed, renderCatalog };
})();
