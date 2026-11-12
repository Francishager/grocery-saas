(function(){
  const root = window.App || (window.App = {});
  const Admin = root.Admin || (root.Admin = {});

  async function fetchBusinesses(){
    if (root.API) return await root.API.get('/admin/crud/Businesses', { ttl: 30000 });
    const resp = await fetch(`${root.API_URL||window.location.origin}/admin/crud/Businesses`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
    const j = await resp.json(); if (!resp.ok) throw new Error(j.error||'Failed to load businesses'); return j;
  }

  function fillSelect(sel, rows){
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = (Array.isArray(rows) ? rows : []).map(b=>`<option value="${b.id}">${b.name||'—'}</option>`).join('');
    if (prev) sel.value = prev;
  }

  async function ensureBusinessOptions(){
    try {
      const rows = await fetchBusinesses();
      fillSelect(document.getElementById('shopBizSelect'), rows);
      fillSelect(document.getElementById('fiscalBizSelect'), rows);
    } catch(e){ console.warn('Business options load failed:', e?.message); }
  }

  async function loadShop(){
    try {
      const id = document.getElementById('shopBizSelect')?.value;
      if (!id) return;
      const rows = await fetchBusinesses();
      const rec = (rows||[]).find(r=>String(r.id)===String(id));
      if (!rec) return;
      const start = document.getElementById('shopStartDate'); if (start) start.value = rec.start_date ? rec.start_date.substring(0,10) : '';
      const end = document.getElementById('shopEndDate'); if (end) end.value = rec.end_date ? rec.end_date.substring(0,10) : '';
      const logo = document.getElementById('shopLogoUrl'); if (logo) logo.value = rec.logo_url || '';
    } catch(e){ showAlert(e.message || 'Load failed', 'danger'); }
  }

  async function saveShop(){
    try {
      const id = document.getElementById('shopBizSelect')?.value;
      if (!id) return;
      const startVal = document.getElementById('shopStartDate')?.value || '';
      const endVal = document.getElementById('shopEndDate')?.value || '';
      const logoVal = document.getElementById('shopLogoUrl')?.value?.trim() || '';
      if (startVal && endVal) {
        const s = new Date(startVal);
        const e = new Date(endVal);
        if (e < s) { showAlert('End Date must be on or after Start Date', 'danger'); return; }
      }
      if (logoVal && !/^https?:\/\//i.test(logoVal)) { showAlert('Logo URL must start with http:// or https://', 'danger'); return; }
      const payload = {
        start_date: startVal || null,
        end_date: endVal || null,
        logo_url: logoVal || null,
      };
      if (root.API) await root.API.patch(`/admin/crud/Businesses/${id}`, { body: payload });
      else {
        const r = await fetch(`${root.API_URL||window.location.origin}/admin/crud/Businesses/${id}`, { method:'PATCH', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(payload) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error||'Save failed');
      }
      showToast('Shop settings saved');
    } catch(e){ showAlert(e.message || 'Save failed', 'danger'); }
  }

  async function loadFiscal(){
    try {
      const id = document.getElementById('fiscalBizSelect')?.value;
      if (!id) return;
      const rows = await fetchBusinesses();
      const rec = (rows||[]).find(r=>String(r.id)===String(id));
      if (!rec) return;
      const start = document.getElementById('fiscalStart'); if (start) start.value = rec.fiscal_year_start ? rec.fiscal_year_start.substring(0,10) : '';
      const end = document.getElementById('fiscalEnd'); if (end) end.value = rec.fiscal_year_end ? rec.fiscal_year_end.substring(0,10) : '';
    } catch(e){ showAlert(e.message || 'Load failed', 'danger'); }
  }

  async function saveFiscal(){
    try {
      const id = document.getElementById('fiscalBizSelect')?.value;
      if (!id) return;
      const startVal = document.getElementById('fiscalStart')?.value || '';
      const endVal = document.getElementById('fiscalEnd')?.value || '';
      if (startVal && endVal) {
        const s = new Date(startVal);
        const e = new Date(endVal);
        if (e < s) { showAlert('Fiscal Year End must be on or after Fiscal Year Start', 'danger'); return; }
      }
      const payload = {
        fiscal_year_start: startVal || null,
        fiscal_year_end: endVal || null,
      };
      if (root.API) await root.API.patch(`/admin/crud/Businesses/${id}`, { body: payload });
      else {
        const r = await fetch(`${root.API_URL||window.location.origin}/admin/crud/Businesses/${id}`, { method:'PATCH', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(payload) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error||'Save failed');
      }
      showToast('Fiscal year settings saved');
    } catch(e){ showAlert(e.message || 'Save failed', 'danger'); }
  }

  function setupUI(){
    ensureBusinessOptions();
    const shopLoad = document.getElementById('shopLoad'); if (shopLoad && !shopLoad._bound){ shopLoad._bound = true; shopLoad.addEventListener('click', (e)=>{ e.preventDefault(); loadShop(); }); }
    const shopSave = document.getElementById('shopSave'); if (shopSave && !shopSave._bound){ shopSave._bound = true; shopSave.addEventListener('click', (e)=>{ e.preventDefault(); saveShop(); }); }
    const fiscalLoad = document.getElementById('fiscalLoad'); if (fiscalLoad && !fiscalLoad._bound){ fiscalLoad._bound = true; fiscalLoad.addEventListener('click', (e)=>{ e.preventDefault(); loadFiscal(); }); }
    const fiscalSave = document.getElementById('fiscalSave'); if (fiscalSave && !fiscalSave._bound){ fiscalSave._bound = true; fiscalSave.addEventListener('click', (e)=>{ e.preventDefault(); saveFiscal(); }); }
  }

  Admin.Settings = { setupUI, ensureBusinessOptions };
})();
