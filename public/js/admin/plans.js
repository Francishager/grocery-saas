(function(){
  const root = window.App || (window.App = {});
  const Admin = root.Admin || (root.Admin = {});
  let planModal;

  function setupUI(){
    if (!planModal) planModal = bsModal('planModal');
    const newBtn = document.getElementById('btnNewPlan');
    if (newBtn && !newBtn._bound){ newBtn._bound = true; newBtn.addEventListener('click', ()=> openForm()); }
    const saveBtn = document.getElementById('planSaveBtn');
    if (saveBtn && !saveBtn._bound){ saveBtn._bound = true; saveBtn.addEventListener('click', save); }
  }

  async function loadTable(){
    try{
      const items = await (root.API ? root.API.get('/admin/crud/Subscription', { ttl: 30000 }) : (async ()=>{
        const resp = await fetch(`${root.API_URL||window.location.origin}/admin/crud/Subscription`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        const j = await resp.json(); if (!resp.ok) throw new Error(j.error || 'Failed to load plans'); return j; })());
      const tbody = document.getElementById('plansTable'); if (!tbody) return;
      if (!Array.isArray(items) || items.length===0){ tbody.innerHTML = `<tr><td colspan="5" class="text-muted">No plans yet</td></tr>`; return; }
      tbody.innerHTML = items.map(p=>{
        const active = (typeof p.is_active === 'boolean') ? (p.is_active ? 'Yes' : 'No') : '—';
        return `<tr>
          <td>${p.name||'—'}</td>
          <td>${typeof formatCurrency==='function' ? formatCurrency(p.price||0) : (p.price||0)}</td>
          <td>${p.billing_cycle||'—'}</td>
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
    planModal?.show();
  }

  async function save(){
    try{
      const id = document.getElementById('plan_id')?.value?.trim();
      const payload = {
        name: document.getElementById('plan_name')?.value?.trim(),
        price: Number(document.getElementById('plan_price')?.value || 0),
        billing_cycle: document.getElementById('plan_cycle')?.value,
        is_active: !!document.getElementById('plan_active')?.checked
      };
      if (root.API) {
        if (id) await root.API.patch(`/admin/crud/Subscription/${id}`, { body: payload });
        else await root.API.post('/admin/crud/Subscription', { body: payload });
      } else {
        const url = id ? `${root.API_URL||window.location.origin}/admin/crud/Subscription/${id}` : `${root.API_URL||window.location.origin}/admin/crud/Subscription`;
        const method = id ? 'PATCH' : 'POST';
        const r = await fetch(url, { method, headers: { 'Content-Type':'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(payload) });
        const dj = await r.json(); if (!r.ok) throw new Error(dj.error || 'Save failed');
      }
      planModal?.hide(); showToast('Plan saved'); loadTable(); if (Admin.Features?.loadMatrix) Admin.Features.loadMatrix();
      try { root.API?.invalidate?.('/admin/crud/Subscription'); } catch {}
    }catch(e){ showAlert(e.message,'danger'); }
  }

  Admin.Plans = { setupUI, loadTable, openForm, save };
})();
