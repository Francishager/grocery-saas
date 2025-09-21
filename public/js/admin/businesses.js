(function(){
  const root = window.App || (window.App = {});
  const Admin = root.Admin || (root.Admin = {});

  function collectData(){
    const bizName = document.getElementById('pf_bizName')?.value?.trim();
    const bizTier = document.getElementById('pf_bizTier')?.value;
    const limitsText = document.getElementById('pf_bizLimits')?.value?.trim();
    let limits = {};
    if (limitsText) { try { limits = JSON.parse(limitsText); } catch { throw new Error('Limits must be valid JSON'); } }
    const owner = {
      fname: document.getElementById('pf_ownerFname')?.value?.trim(),
      mname: document.getElementById('pf_ownerMname')?.value?.trim(),
      lname: document.getElementById('pf_ownerLname')?.value?.trim(),
      email: document.getElementById('pf_ownerEmail')?.value?.trim(),
      temp_password: document.getElementById('pf_ownerTempPass')?.value,
      business_id: document.getElementById('pf_ownerBizId')?.value?.trim(),
      business_name: document.getElementById('pf_ownerBizName')?.value?.trim(),
    };
    return { business: { name: bizName, subscription_tier: bizTier, limits }, owner };
  }

  function renderSummary(){
    const container = document.getElementById('pf_review');
    if (!container) return;
    let data;
    try { data = collectData(); } catch(e){ showAlert(e.message, 'danger'); return; }
    const html = `
      <div class="row g-3">
        <div class="col-md-6">
          <h6>Business</h6>
          <div><strong>Name:</strong> ${data.business.name}</div>
          <div><strong>Tier:</strong> ${data.business.subscription_tier}</div>
          <div><strong>Limits:</strong> <code>${JSON.stringify(data.business.limits || {})}</code></div>
        </div>
        <div class="col-md-6">
          <h6>Owner</h6>
          <div><strong>Name:</strong> ${data.owner.fname} ${data.owner.mname || ''} ${data.owner.lname}</div>
          <div><strong>Email:</strong> ${data.owner.email}</div>
          <div><strong>Business ID:</strong> ${data.owner.business_id}</div>
          <div><strong>Business Name:</strong> ${data.owner.business_name || '(same as business)'}</div>
        </div>
      </div>`;
    container.innerHTML = html;
  }

  function setStep(n){
    document.querySelectorAll('.step-indicator .step').forEach((el) => el.classList.toggle('active', Number(el.dataset.step) === n));
    document.querySelectorAll('[data-step-pane]').forEach((pane) => {
      pane.classList.toggle('d-none', Number(pane.dataset.stepPane) !== n);
    });
  }

  function setupWizard(){
    setStep(1);
    document.querySelectorAll('#provisionForm [data-next]').forEach(btn => btn.addEventListener('click', (e) => {
      e.preventDefault();
      const curr = Number(document.querySelector('.step-indicator .step.active')?.dataset.step || 1);
      const next = Math.min(3, curr + 1);
      setStep(next);
      if (next === 3) renderSummary();
    }));
    document.querySelectorAll('#provisionForm [data-prev]').forEach(btn => btn.addEventListener('click', (e) => {
      e.preventDefault();
      const curr = Number(document.querySelector('.step-indicator .step.active')?.dataset.step || 1);
      const prev = Math.max(1, curr - 1);
      setStep(prev);
    }));
    document.querySelectorAll('#provisionForm [data-cancel]').forEach(btn => btn.addEventListener('click', (e) => {
      e.preventDefault();
      setActiveSection('section-businesses');
    }));
    const form = document.getElementById('provisionForm');
    if (form && !form._bound){ form._bound = true; form.addEventListener('submit', submit); }
  }

  async function submit(e){
    e.preventDefault();
    const btn = e.submitter || e.target.querySelector('[type="submit"]');
    const orig = btn?.textContent; if (btn){ btn.textContent = 'Creating...'; btn.disabled = true; }
    try {
      const data = collectData();
      // Create Owner (User)
      let ownerId = null;
      if (data.owner?.email){
        const userPayload = {
          fname: data.owner.fname,
          mname: data.owner.mname,
          lname: data.owner.lname,
          email: data.owner.email,
          phone_number: data.owner.phone_number || '',
          role: 'Owner'
        };
        if (root.API) {
          const u = await root.API.post('/admin/crud/Users', { body: userPayload });
          ownerId = u.id || u.recordId || u.record_id || null;
        } else {
          const uRes = await fetch(`${root.API_URL||window.location.origin}/admin/crud/Users`, { method:'POST', headers: { 'Content-Type':'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(userPayload) });
          const uJson = await uRes.json(); if (!uRes.ok) throw new Error(uJson.error||'Failed to create owner'); ownerId = uJson.id || uJson.recordId || uJson.record_id || null;
        }
      }
      // Create Business
      const bizPayload = {
        name: data.business.name,
        owner_id: ownerId,
        subscription_id: (document.getElementById('pf_planId')?.value || null) || null,
        start_date: document.getElementById('pf_startDate')?.value || null,
        end_date: document.getElementById('pf_endDate')?.value || null,
        logo_url: document.getElementById('pf_logoUrl')?.value || null,
        status: 'active'
      };
      let businessId = null;
      if (root.API){
        const b = await root.API.post('/admin/crud/Businesses', { body: bizPayload });
        businessId = b.id || b.recordId || b.record_id || null;
      } else {
        const bRes = await fetch(`${root.API_URL||window.location.origin}/admin/crud/Businesses`, { method:'POST', headers: { 'Content-Type':'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(bizPayload) });
        const bJson = await bRes.json(); if (!bRes.ok) throw new Error(bJson.error||'Failed to create business'); businessId = bJson.id || bJson.recordId || bJson.record_id || null;
      }
      // Optional Branch
      const branchName = document.getElementById('pf_branchName')?.value?.trim();
      if (branchName && businessId){
        const branchPayload = { business_id: businessId, name: branchName, address: document.getElementById('pf_branchAddress')?.value || '' };
        if (root.API) await root.API.post('/admin/crud/Branches', { body: branchPayload });
        else await fetch(`${root.API_URL||window.location.origin}/admin/crud/Branches`, { method:'POST', headers: { 'Content-Type':'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(branchPayload) });
      }
      showToast('Tenant created successfully', { linkText: 'View Businesses', onClick: ()=> setActiveSection('section-businesses') });
      setActiveSection('section-businesses');
      try { root.API?.invalidate?.('/admin/crud/Businesses'); } catch {}
    } catch(err){ showAlert(err.message, 'danger'); }
    finally { if (btn){ btn.textContent = orig || 'Create'; btn.disabled = false; } }
  }

  async function loadList(){
    const tbody = document.querySelector('#businessesTable tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" class="text-muted">Loading...</td></tr>`;
    try {
      const data = await (root.API ? root.API.get('/admin/businesses', { ttl: 30000 }) : (async ()=>{
        const resp = await fetch(`${root.API_URL||window.location.origin}/admin/businesses`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        const j = await resp.json(); if (!resp.ok) throw new Error(j.error||'Failed to load businesses'); return j; })());
      if (!Array.isArray(data) || data.length === 0) { tbody.innerHTML = `<tr><td colspan="4" class="text-muted">No businesses yet</td></tr>`; return; }
      tbody.innerHTML = data.map(b => {
        const active = (typeof b.is_active === 'boolean') ? (b.is_active ? 'Yes' : 'No') : '—';
        const created = b.created_at ? new Date(b.created_at).toLocaleString() : '—';
        const tier = b.subscription_tier || '—';
        const name = b.name || '—';
        return `<tr><td>${name}</td><td>${tier}</td><td>${active}</td><td>${created}</td></tr>`;
      }).join('');
      if (root.ACL && root.ability) root.ACL.applyDomPermissions(root.ability, tbody);
    } catch (err) {
      showAlert(err.message, 'danger');
      tbody.innerHTML = `<tr><td colspan="4" class="text-danger">${err.message}</td></tr>`;
    }
  }

  function setupUI(){
    // Setup Create button and FAB to open wizard
    const createBtn = document.getElementById('createBusinessBtn');
    if (createBtn && !createBtn._bound){
      createBtn._bound = true;
      createBtn.addEventListener('click', ()=>{ setActiveSection('section-provision'); setStep(1); const form = document.getElementById('provisionForm'); if (form) form.reset(); });
    }
    const fab = document.getElementById('fabCreate');
    if (fab && !fab._bound){ fab._bound = true; fab.addEventListener('click', ()=>{ setActiveSection('section-provision'); setStep(1); const form = document.getElementById('provisionForm'); if (form) form.reset(); }); }
    setupWizard();
  }

  Admin.Businesses = { setupUI, loadList, submit };
})();
