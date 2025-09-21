(function(){
  const root = window.App || (window.App = {});
  const Admin = root.Admin || (root.Admin = {});

  function readFilters(){
    const status = (document.getElementById('subsFilterStatus')?.value || '').trim();
    const owner = (document.getElementById('subsFilterOwner')?.value || '').trim();
    const from = (document.getElementById('subsFilterFrom')?.value || '').trim();
    const to = (document.getElementById('subsFilterTo')?.value || '').trim();
    return { status, owner, from, to };
  }

  async function loadAll(){
    try{
      const filters = readFilters();
      const data = await (root.API ? root.API.get('/admin/subscriptions', { params: filters, ttl: 15000 }) : (async ()=>{
        const qp = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([_,v])=>v)));
        const url = `${root.API_URL||window.location.origin}/admin/subscriptions${qp.toString() ? ('?' + qp.toString()) : ''}`;
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        const j = await resp.json(); if (!resp.ok) throw new Error(j.error || 'Failed to load subscriptions'); return j; })());
      const tbody = document.getElementById('subsTable'); if (!tbody) return;
      if (!Array.isArray(data) || data.length === 0) { tbody.innerHTML = `<tr><td colspan="6" class="text-muted">No subscriptions found</td></tr>`; return; }
      tbody.innerHTML = data.map(s=>{
        const start = s.start_date ? new Date(s.start_date).toLocaleDateString() : '—';
        const renew = s.renewed_at ? new Date(s.renewed_at).toLocaleDateString() : '—';
        return `<tr><td>${s.business||'—'}</td><td>${s.owner||'—'}</td><td>${s.plan||'—'}</td><td>${s.status||'—'}</td><td>${start}</td><td>${renew}</td></tr>`;
      }).join('');
      if (root.ACL && root.ability) root.ACL.applyDomPermissions(root.ability, tbody);
    } catch(e){ showAlert(e.message, 'danger'); }
  }

  let filtersBound = false, newFormBound = false;
  function setupUI(){
    if (!filtersBound){
      filtersBound = true;
      const apply = document.getElementById('subsFilterApply');
      if (apply) apply.addEventListener('click', (e)=>{ e.preventDefault(); loadAll(); });
      const clear = document.getElementById('subsFilterClear');
      if (clear) clear.addEventListener('click', (e)=>{ e.preventDefault(); ['subsFilterStatus','subsFilterOwner','subsFilterFrom','subsFilterTo'].forEach(id=>{ const el = document.getElementById(id); if (el) el.value = ''; }); loadAll(); });
    }
    if (!newFormBound){
      newFormBound = true;
      const form = document.getElementById('subsNewForm');
      if (form) form.addEventListener('submit', createNew);
    }
  }

  async function createNew(e){
    e.preventDefault();
    const form = e.target.closest('form') || document.getElementById('subsNewForm');
    const btn = form?.querySelector('[type="submit"]');
    const orig = btn?.textContent; if (btn){ btn.textContent = 'Creating...'; btn.disabled = true; }
    try{
      const payload = {
        business_id: document.getElementById('sn_business_id')?.value?.trim(),
        owner_email: document.getElementById('sn_owner_email')?.value?.trim(),
        plan: document.getElementById('sn_plan')?.value,
        billing_cycle: document.getElementById('sn_cycle')?.value,
        start_date: document.getElementById('sn_start')?.value || undefined,
        amount: Number(document.getElementById('sn_amount')?.value || 0)
      };
      if (!payload.business_id || !payload.owner_email) throw new Error('Business ID and Owner Email are required');
      if (root.API) await root.API.post('/admin/subscriptions', { body: payload });
      else {
        const resp = await fetch(`${root.API_URL||window.location.origin}/admin/subscriptions`, { method:'POST', headers: { 'Content-Type':'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(payload) });
        const dj = await resp.json(); if (!resp.ok) throw new Error(dj.error || 'Failed to create subscription');
      }
      showToast('Subscription created', { linkText: 'View All', onClick: ()=> setActiveSection('section-subs-all') });
      form?.reset();
      try { root.API?.invalidate?.('/admin/subscriptions'); } catch {}
    } catch(err){ showAlert(err.message, 'danger'); }
    finally { if (btn){ btn.textContent = orig || 'Create Subscription'; btn.disabled = false; } }
  }

  Admin.Subscriptions = { setupUI, loadAll, createNew };
})();
