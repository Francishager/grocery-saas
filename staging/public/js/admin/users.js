(function(){
  const root = window.App || (window.App = {});
  const Admin = root.Admin || (root.Admin = {});

  function fmtDate(v){ try { return v ? new Date(v).toLocaleString() : '—'; } catch { return '—'; } }

  async function loadBusinesses(){
    try{
      if (root.API) return await root.API.get('/admin/crud/Businesses', { ttl: 60000 });
      const r = await fetch(`${root.API_URL||window.location.origin}/admin/crud/Businesses`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      const j = await r.json(); if (!r.ok) throw new Error(j.error||'Failed to load businesses'); return j;
    } catch(e){ console.warn('loadBusinesses failed:', e?.message); return []; }
  }

  async function loadList(){
    try{
      const data = await (root.API ? root.API.get('/admin/crud/Users', { ttl: 15000 }) : (async()=>{
        const r = await fetch(`${root.API_URL||window.location.origin}/admin/crud/Users`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        const j = await r.json(); if (!r.ok) throw new Error(j.error||'Failed to load users'); return j; })());
      const tbody = document.getElementById('usersTable'); if (!tbody) return;
      if (!Array.isArray(data) || data.length===0){ tbody.innerHTML = `<tr><td colspan="7" class="text-muted">No users</td></tr>`; return; }
      const rows = data.slice().sort((a,b)=> String(b.created_at||'').localeCompare(String(a.created_at||'')));
      tbody.innerHTML = rows.map(u=>{
        const name = [u.fname, u.mname, u.lname].filter(Boolean).join(' ') || '—';
        const email = u.email || '—';
        const role = u.role || '—';
        const bid = u.business_id || '—';
        const created = fmtDate(u.created_at);
        const txn = u.txn_account || u.txn_account_code || '—';
        return `<tr>
          <td>${name}</td>
          <td>${email}</td>
          <td>${role}</td>
          <td>${bid}</td>
          <td>${txn}</td>
          <td>${created}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary" data-edit-user="${u.id}">Edit</button>
          </td>
        </tr>`;
      }).join('');
      try { if (root.ACL && root.ability) root.ACL.applyDomPermissions(root.ability, tbody); } catch {}
      // Bind edit buttons
      tbody.querySelectorAll('[data-edit-user]')?.forEach(btn=>{
        if (btn._bound) return; btn._bound = true;
        btn.addEventListener('click', (e)=>{
          const id = e.currentTarget.getAttribute('data-edit-user');
          const user = rows.find(x=> String(x.id) === String(id));
          openEdit(user);
        });
      });
    } catch(e){ tbody.innerHTML = `<tr><td colspan="6" class="text-danger">${e.message}</td></tr>`; }
  }

  function ensureModal(){
    if (document.getElementById('userModal')) return;
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="modal" id="userModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header"><h6 class="modal-title" id="userModalTitle">Create User</h6><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
            <div class="modal-body">
              <form id="userForm" class="row g-3">
                <input type="hidden" id="us_id" />
                <div class="col-12">
                  <label class="form-label small">Business</label>
                  <select id="us_business_id" class="form-select" required></select>
                </div>
                <div class="col-md-4"><label class="form-label">First name</label><input id="us_fname" class="form-control" required /></div>
                <div class="col-md-4"><label class="form-label">Middle</label><input id="us_mname" class="form-control" /></div>
                <div class="col-md-4"><label class="form-label">Last name</label><input id="us_lname" class="form-control" required /></div>
                <div class="col-md-6"><label class="form-label">Email</label><input id="us_email" type="email" class="form-control" required /></div>
                <div class="col-md-6"><label class="form-label">Phone</label><input id="us_phone" class="form-control" /></div>
                <div class="col-md-6"><label class="form-label">Role</label>
                  <select id="us_role" class="form-select">
                    <option value="Cashier">Cashier</option>
                    <option value="Manager">Manager</option>
                    <option value="Accountant">Accountant</option>
                  </select>
                </div>
                <div class="col-md-6"><label class="form-label">Transaction Account</label><input id="us_txn" class="form-control" placeholder="e.g. 1010-TILL-A" /></div>
                <div class="col-12 form-text">Password setup is handled via OTP email after account creation.</div>
              </form>
              <div id="userMsg" class="alert d-none mt-2" role="alert"></div>
            </div>
            <div class="modal-footer"><button class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button><button id="userSaveBtn" class="btn btn-primary btn-sm">Save</button></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(div.firstElementChild);
    document.getElementById('userSaveBtn').addEventListener('click', saveUser);
  }

  function showMsg(type, text){ const el = document.getElementById('userMsg'); if (!el) return; el.className = `alert alert-${type} mt-2`; el.textContent = text; el.classList.remove('d-none'); }

  async function openModal(){
    ensureModal();
    const sel = document.getElementById('us_business_id'); if (sel){ sel.innerHTML = '<option value="">—</option>'; }
    try {
      const items = await loadBusinesses();
      if (sel) sel.innerHTML = '<option value="">— Select Business —</option>' + (Array.isArray(items) ? items.map(b=>{
        const code = b.business_id || b.id; const name = b.name || '';
        return `<option value="${code}">${code} — ${name}</option>`;
      }).join('') : '');
    } catch(e){ console.warn('fill businesses failed', e?.message); }
    document.getElementById('userModalTitle').textContent = 'Create User';
    const form = document.getElementById('userForm'); if (form) form.reset();
    const idEl = document.getElementById('us_id'); if (idEl) idEl.value = '';
    bsModal('userModal')?.show();
    const msg = document.getElementById('userMsg'); if (msg) msg.classList.add('d-none');
  }

  function openEdit(u){
    ensureModal();
    const msg = document.getElementById('userMsg'); if (msg) msg.classList.add('d-none');
    document.getElementById('userModalTitle').textContent = 'Edit User';
    const idEl = document.getElementById('us_id'); if (idEl) idEl.value = u?.id || '';
    document.getElementById('us_business_id').innerHTML = `<option value="${u.business_id||''}">${u.business_id||'—'}</option>`;
    document.getElementById('us_fname').value = u?.fname || '';
    document.getElementById('us_mname').value = u?.mname || '';
    document.getElementById('us_lname').value = u?.lname || '';
    document.getElementById('us_email').value = u?.email || '';
    document.getElementById('us_phone').value = u?.phone_number || '';
    document.getElementById('us_role').value = u?.role || 'Cashier';
    document.getElementById('us_txn').value = u?.txn_account || u?.txn_account_code || '';
    bsModal('userModal')?.show();
  }

  async function saveUser(){
    const btn = document.getElementById('userSaveBtn'); const orig = btn?.textContent; if (btn){ btn.textContent = 'Saving...'; btn.disabled = true; }
    try{
      const payload = {
        business_id: document.getElementById('us_business_id')?.value?.trim(),
        fname: document.getElementById('us_fname')?.value?.trim(),
        mname: document.getElementById('us_mname')?.value?.trim(),
        lname: document.getElementById('us_lname')?.value?.trim(),
        email: document.getElementById('us_email')?.value?.trim(),
        phone_number: document.getElementById('us_phone')?.value?.trim(),
        role: document.getElementById('us_role')?.value || 'Cashier',
        // Preferred name for backend
        txn_account: document.getElementById('us_txn')?.value?.trim() || null,
      };
      if (!payload.business_id || !payload.fname || !payload.lname || !payload.email) { showMsg('danger','Please fill required fields'); return; }
      const id = document.getElementById('us_id')?.value?.trim();
      if (root.API){
        if (id) await root.API.patch(`/admin/crud/Users/${id}`, { body: payload, skipCache: true });
        else await root.API.post('/admin/crud/Users', { body: payload, skipCache: true });
      } else {
        const url = id ? `${root.API_URL||window.location.origin}/admin/crud/Users/${id}` : `${root.API_URL||window.location.origin}/admin/crud/Users`;
        const method = id ? 'PATCH' : 'POST';
        const r = await fetch(url, { method, headers: { 'Content-Type':'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(payload) });
        const j = await r.json().catch(()=>({})); if (!r.ok) throw new Error(j?.error||'Failed to save user');
      }
      bsModal('userModal')?.hide();
      showToast(id ? 'User updated' : 'User created');
      loadList();
      try { root.API?.invalidate?.('/admin/crud/Users'); } catch {}
    } catch(e){
      // Plan limit errors surface here (HTTP 400 with specific message)
      showMsg('danger', e.message || 'Failed to create user');
    } finally { if (btn){ btn.textContent = orig || 'Save'; btn.disabled = false; } }
  }

  function setupUI(){
    const newBtn = document.getElementById('btnNewUser');
    if (newBtn && !newBtn._bound){ newBtn._bound = true; newBtn.addEventListener('click', openModal); }
  }

  Admin.Users = { setupUI, loadList };
})();
