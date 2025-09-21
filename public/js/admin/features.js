(function(){
  const root = window.App || (window.App = {});
  const Admin = root.Admin || (root.Admin = {});
  let featureModal;

  function setupUI(){
    if (!featureModal) featureModal = bsModal('featureModal');
    const newBtn = document.getElementById('btnNewFeature');
    if (newBtn && !newBtn._bound){ newBtn._bound = true; newBtn.addEventListener('click', ()=> openForm()); }
    const saveBtn = document.getElementById('featureSaveBtn');
    if (saveBtn && !saveBtn._bound){ saveBtn._bound = true; saveBtn.addEventListener('click', save); }
    const saveMx = document.getElementById('btnSaveMatrix');
    if (saveMx && !saveMx._bound){ saveMx._bound = true; saveMx.addEventListener('click', saveMatrix); }
  }

  async function loadTable(){
    try{
      const items = await (root.API ? root.API.get('/admin/crud/Features', { ttl: 30000 }) : (async ()=>{
        const resp = await fetch(`${root.API_URL||window.location.origin}/admin/crud/Features`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        const j = await resp.json(); if (!resp.ok) throw new Error(j.error || 'Failed to load features'); return j; })());
      const tbody = document.getElementById('featuresTable'); if (!tbody) return;
      if (!Array.isArray(items) || items.length===0){ tbody.innerHTML = `<tr><td colspan="4" class="text-muted">No features</td></tr>`; return; }
      tbody.innerHTML = items.map(f=>{
        const active = (typeof f.is_active === 'boolean') ? (f.is_active ? 'Yes' : 'No') : '—';
        return `<tr>
          <td>${f.name||'—'}</td>
          <td><code>${f.code||''}</code></td>
          <td>${active}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary" data-edit-feature="${f.id}" data-can="manage:all">Edit</button>
            <button class="btn btn-sm btn-outline-danger ms-1" data-del-feature="${f.id}" data-can="manage:all">Delete</button>
          </td>
        </tr>`;
      }).join('');
      if (root.ACL && root.ability) root.ACL.applyDomPermissions(root.ability, tbody);
      tbody.querySelectorAll('[data-edit-feature]').forEach(b=>b.addEventListener('click',(e)=>{
        const id = e.currentTarget.getAttribute('data-edit-feature');
        const f = items.find(x=>String(x.id)===String(id));
        openForm(f);
      }));
      tbody.querySelectorAll('[data-del-feature]').forEach(b=>b.addEventListener('click', async (e)=>{
        const id = e.currentTarget.getAttribute('data-del-feature');
        if (!confirm('Delete this feature?')) return;
        try {
          if (root.API) {
            await root.API.delete(`/admin/crud/Features/${id}`);
          } else {
            const r = await fetch(`${root.API_URL||window.location.origin}/admin/crud/Features/${id}`, { method:'DELETE', headers:{ Authorization:`Bearer ${localStorage.getItem('token')}` } });
            const dj = await r.json(); if (!r.ok) throw new Error(dj.error||'Delete failed');
          }
          showToast('Feature deleted'); loadTable(); if (Admin.Features?.loadMatrix) Admin.Features.loadMatrix();
          try { root.API?.invalidate?.('/admin/crud/Features'); } catch {}
        } catch(err){ showAlert(err.message, 'danger'); }
      }));
    }catch(e){ showAlert(e.message,'danger'); }
  }

  function openForm(f){
    const idEl = document.getElementById('feature_id'); if (!idEl) return;
    idEl.value = f?.id || '';
    const n = document.getElementById('feature_name'); if (n) n.value = f?.name || '';
    const c = document.getElementById('feature_code'); if (c) c.value = f?.code || '';
    const d = document.getElementById('feature_desc'); if (d) d.value = f?.description || '';
    const a = document.getElementById('feature_active'); if (a) a.checked = (typeof f?.is_active === 'boolean') ? !!f.is_active : true;
    featureModal?.show();
  }

  async function save(){
    try{
      const id = document.getElementById('feature_id')?.value?.trim();
      const payload = {
        name: document.getElementById('feature_name')?.value?.trim(),
        code: document.getElementById('feature_code')?.value?.trim() || undefined,
        description: document.getElementById('feature_desc')?.value?.trim(),
        is_active: !!document.getElementById('feature_active')?.checked
      };
      if (root.API) {
        if (id) await root.API.patch(`/admin/crud/Features/${id}`, { body: payload });
        else await root.API.post('/admin/crud/Features', { body: payload });
      } else {
        const url = id ? `${root.API_URL||window.location.origin}/admin/crud/Features/${id}` : `${root.API_URL||window.location.origin}/admin/crud/Features`;
        const method = id ? 'PATCH' : 'POST';
        const r = await fetch(url, { method, headers: { 'Content-Type':'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(payload) });
        const dj = await r.json(); if (!r.ok) throw new Error(dj.error || 'Save failed');
      }
      featureModal?.hide(); showToast('Feature saved'); loadTable(); if (Admin.Features?.loadMatrix) Admin.Features.loadMatrix();
      try { root.API?.invalidate?.('/admin/crud/Features'); } catch {}
    }catch(e){ showAlert(e.message,'danger'); }
  }

  async function loadMatrix(){
    const container = document.getElementById('featureMatrix'); if (!container) return;
    try{
      const [plans, feats, maps] = await (root.API ? Promise.all([
        root.API.get('/admin/crud/Subscription', { ttl: 30000 }),
        root.API.get('/admin/crud/Features', { ttl: 30000 }),
        root.API.get('/admin/crud/Subscription_Features', { ttl: 15000 }),
      ]) : (async ()=>{
        const [pr, fr, mr] = await Promise.all([
          fetch(`${root.API_URL||window.location.origin}/admin/crud/Subscription`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
          fetch(`${root.API_URL||window.location.origin}/admin/crud/Features`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
          fetch(`${root.API_URL||window.location.origin}/admin/crud/Subscription_Features`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        ]);
        const pj = await pr.json(); if (!pr.ok) throw new Error(pj.error||'Plans load failed');
        const fj = await fr.json(); if (!fr.ok) throw new Error(fj.error||'Features load failed');
        const mj = await mr.json(); if (!mr.ok) throw new Error(mj.error||'Map load failed');
        return [pj, fj, mj];
      })());
      const header = `<thead><tr><th>Feature</th>${plans.map(p=>`<th class=\"text-center\">${p.name}</th>`).join('')}</tr></thead>`;
      const body = `<tbody>${feats.map(f=>{
        return `<tr><td>${f.name} <small class=\"text-muted\">${f.code||''}</small></td>${plans.map(p=>{
          const existing = maps.find(m=>String(m.subscription_id)===String(p.id) && String(m.feature_id)===String(f.id));
          const checked = existing ? 'checked' : '';
          const limit = existing?.limit_value || '';
          const mapId = existing?.id || '';
          return `<td class=\"text-center\">\n            <input type=\"checkbox\" class=\"form-check-input align-middle\" data-mx=\"${p.id}:${f.id}\" ${checked} />\n            <input type=\"text\" class=\"form-control form-control-sm mt-1\" placeholder=\"limit\" data-mx-limit=\"${p.id}:${f.id}\" value=\"${limit}\">\n            <input type=\"hidden\" data-mx-id=\"${p.id}:${f.id}\" value=\"${mapId}\">\n          </td>`;
        }).join('')}</tr>`;
      }).join('')}</tbody>`;
      container.innerHTML = `<table class="table table-sm align-middle">${header}${body}</table>`;
    }catch(e){ container.innerHTML = `<div class=\"text-danger\">${e.message}</div>`; }
  }

  async function saveMatrix(){
    try{
      const cbs = Array.from(document.querySelectorAll('[data-mx]'));
      const ops = [];
      for (const cb of cbs){
        const key = cb.getAttribute('data-mx');
        const [subId, featId] = key.split(':');
        const idEl = document.querySelector(`[data-mx-id="${key}"]`);
        const limitEl = document.querySelector(`[data-mx-limit="${key}"]`);
        const existingId = idEl?.value || '';
        const limitVal = limitEl?.value || null;
        if (cb.checked && !existingId) ops.push({ a:'c', p:{ subscription_id:Number(subId), feature_id:Number(featId), limit_value:limitVal } });
        else if (cb.checked && existingId) ops.push({ a:'u', id: existingId, p:{ limit_value:limitVal } });
        else if (!cb.checked && existingId) ops.push({ a:'d', id: existingId });
      }
      for (const op of ops){
        if (root.API){
          if (op.a==='c') await root.API.post('/admin/crud/Subscription_Features', { body: op.p });
          else if (op.a==='u') await root.API.patch(`/admin/crud/Subscription_Features/${op.id}`, { body: { limit_value: op.p.limit_value } });
          else if (op.a==='d') await root.API.delete(`/admin/crud/Subscription_Features/${op.id}`);
        } else {
          if (op.a==='c') await fetch(`${root.API_URL||window.location.origin}/admin/crud/Subscription_Features`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(op.p) });
          else if (op.a==='u') await fetch(`${root.API_URL||window.location.origin}/admin/crud/Subscription_Features/${op.id}`, { method:'PATCH', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify({limit_value: op.p.limit_value}) });
          else if (op.a==='d') await fetch(`${root.API_URL||window.location.origin}/admin/crud/Subscription_Features/${op.id}`, { method:'DELETE', headers:{ Authorization:`Bearer ${localStorage.getItem('token')}` } });
        }
      }
      showToast('Feature matrix saved'); await loadMatrix();
      try { root.API?.invalidate?.('/admin/crud/Subscription_Features'); } catch {}
    }catch(e){ showAlert(e.message,'danger'); }
  }

  Admin.Features = { setupUI, loadTable, openForm, save, loadMatrix, saveMatrix };
})();
