(function(){
  const root = window.App || (window.App = {});
  const Admin = root.Admin || (root.Admin = {});

  // Schema validation (Ajv) integration
  let _ajv = null;
  const _validators = { business: null, owner: null, branch: null, provision: null };
  async function ensureValidators(){
    if (_validators.provision) return _validators;
    try {
      if (!_ajv) {
        try {
          const mod = await import('https://cdn.jsdelivr.net/npm/ajv@8/dist/ajv2020.min.js');
          _ajv = new (mod.default || mod.Ajv || mod)({ allErrors: true, allowUnionTypes: true });
          try {
            const fm = await import('https://cdn.jsdelivr.net/npm/ajv-formats@2/dist/ajv-formats.min.js');
            const addFormats = (fm.default || fm);
            if (typeof addFormats === 'function') addFormats(_ajv);
          } catch (fe) { console.warn('ajv-formats load failed:', fe?.message); }
        } catch (e) {
          console.warn('Ajv load failed, falling back to minimal checks:', e?.message);
          _ajv = null;
        }
      }
      const [bizRes, ownerRes, branchRes, provisionRes] = await Promise.all([
        fetch('js/admin/schemas/BusinessStep.schema.json'),
        fetch('js/admin/schemas/OwnerStep.schema.json'),
        fetch('js/admin/schemas/BranchStep.schema.json'),
        fetch('js/admin/schemas/ProvisionPayload.schema.json'),
      ]);
      const [biz, owner, branch, provision] = await Promise.all([
        bizRes.json(), ownerRes.json(), branchRes.json(), provisionRes.json()
      ]);
      if (_ajv){
        // Register referenced schemas to let $ref resolve by $id
        try { _ajv.addSchema(biz, biz.$id || 'BusinessStep.schema.json'); } catch {}
        try { _ajv.addSchema(owner, owner.$id || 'OwnerStep.schema.json'); } catch {}
        try { _ajv.addSchema(branch, branch.$id || 'BranchStep.schema.json'); } catch {}
        _validators.business = _ajv.compile(biz);
        _validators.owner = _ajv.compile(owner);
        _validators.branch = _ajv.compile(branch);
        _validators.provision = _ajv.compile(provision);
      } else {
        // Minimal fallback validators
        _validators.business = (data)=> !!data?.name && (!!data?.subscription_tier || !!data?.subscription_id);
        _validators.owner = (data)=> !!data?.fname && !!data?.lname && !!data?.email && !!data?.business_id;
        _validators.provision = (data)=> _validators.business(data?.business) && _validators.owner(data?.owner);
      }
    } catch (e) {
      console.warn('Schema load failed:', e?.message);
      // fallback minimal checks
      _validators.business = (data)=> !!data?.name && (!!data?.subscription_tier || !!data?.subscription_id);
      _validators.owner = (data)=> !!data?.fname && !!data?.lname && !!data?.email && !!data?.business_id;
      _validators.provision = (data)=> _validators.business(data?.business) && _validators.owner(data?.owner);
    }
    return _validators;
  }

  function showSchemaErrors(errors){
    if (!errors || !errors.length) return;
    const msg = errors.map(e=>`• ${(e.instancePath||'/')} ${e.message}`).join('\n');
    showAlert(msg, 'danger');
  }

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
      phone_number: document.getElementById('pf_ownerPhone')?.value?.trim(),
      temp_password: document.getElementById('pf_ownerTempPass')?.value,
      business_id: document.getElementById('pf_ownerBizId')?.value?.trim(),
      business_name: document.getElementById('pf_ownerBizName')?.value?.trim(),
    };
    const business = {
      name: bizName,
      subscription_tier: bizTier,
      limits,
      subscription_id: document.getElementById('pf_planId')?.value || null,
      start_date: document.getElementById('pf_startDate')?.value || null,
      end_date: document.getElementById('pf_endDate')?.value || null,
      logo_url: document.getElementById('pf_logoUrl')?.value?.trim() || null,
      fiscal_year_start: document.getElementById('pf_fiscalStart')?.value || null,
      fiscal_year_end: document.getElementById('pf_fiscalEnd')?.value || null,
    };
    return { business, owner };
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
          <div><strong>Plan ID:</strong> ${data.business.subscription_id || '—'}</div>
          <div><strong>Start - End:</strong> ${data.business.start_date || '—'} → ${data.business.end_date || '—'}</div>
          <div><strong>Fiscal Year:</strong> ${data.business.fiscal_year_start || '—'} → ${data.business.fiscal_year_end || '—'}</div>
        </div>
        <div class="col-md-6">
          <h6>Owner</h6>
          <div><strong>Name:</strong> ${data.owner.fname} ${data.owner.mname || ''} ${data.owner.lname}</div>
          <div><strong>Email:</strong> ${data.owner.email}</div>
          <div><strong>Phone:</strong> ${data.owner.phone_number || '—'}</div>
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
    document.querySelectorAll('#tenantForm [data-next]').forEach(btn => btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const curr = Number(document.querySelector('.step-indicator .step.active')?.dataset.step || 1);
      // Validate current step before advancing
      try { await ensureValidators(); } catch {}
      if (curr === 1){
        // Validate Business
        const data = collectData();
        const valid = _validators.business ? (_validators.business(data.business) === true) : true;
        if (!valid){ return _ajv ? showSchemaErrors(_validators.business.errors) : showAlert('Please complete Business details', 'danger'); }
      }
      if (curr === 2){
        // Validate Owner
        const data = collectData();
        const valid = _validators.owner ? (_validators.owner(data.owner) === true) : true;
        if (!valid){ return _ajv ? showSchemaErrors(_validators.owner.errors) : showAlert('Please complete Owner details', 'danger'); }
      }
      const next = Math.min(3, curr + 1);
      setStep(next);
      if (next === 3) renderSummary();
    }));
    document.querySelectorAll('#tenantForm [data-prev]').forEach(btn => btn.addEventListener('click', (e) => {
      e.preventDefault();
      const curr = Number(document.querySelector('.step-indicator .step.active')?.dataset.step || 1);
      const prev = Math.max(1, curr - 1);
      setStep(prev);
    }));
    document.querySelectorAll('#tenantForm [data-cancel]').forEach(btn => btn.addEventListener('click', (e) => {
      e.preventDefault();
      setActiveSection('section-businesses');
    }));
    const form = document.getElementById('tenantForm');
    if (form && !form._bound){ form._bound = true; form.addEventListener('submit', submit); }
  }

  async function submit(e){
    e.preventDefault();
    const btn = e.submitter || e.target.querySelector('[type="submit"]');
    const orig = btn?.textContent; if (btn){ btn.textContent = 'Creating...'; btn.disabled = true; }
    try {
      const data = collectData();
      await ensureValidators();
      const payload = { business: data.business, owner: data.owner };
      const valid = _validators.provision ? (_validators.provision(payload) === true) : true;
      if (!valid){ return _ajv ? showSchemaErrors(_validators.provision.errors) : showAlert('Please complete required fields', 'danger'); }

      // Create Tenant via backend endpoint (atomic Business + Owner with OTP)
      if (root.API) {
        await root.API.post('/admin/create-tenant', { body: payload });
      } else {
        const r = await fetch(`${root.API_URL||window.location.origin}/admin/create-tenant`, { method:'POST', headers: { 'Content-Type':'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }, body: JSON.stringify(payload) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error||'Failed to create tenant');
      }

      // Optional Branch (use owner.business_id to associate)
      const branchName = document.getElementById('pf_branchName')?.value?.trim();
      const branchLocation = document.getElementById('pf_branchLocation')?.value?.trim();
      const branchOpening = document.getElementById('pf_branchOpening')?.value || null;
      if (branchName && payload.owner?.business_id){
        const branchPayload = { business_id: payload.owner.business_id, name: branchName, location: branchLocation || '', opening_date: branchOpening };
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
      createBtn.addEventListener('click', ()=>{ setActiveSection('section-create-tenant'); setStep(1); const form = document.getElementById('tenantForm'); if (form) form.reset(); try{ ensureValidators(); }catch{}; try { fillPlanDropdown(); } catch {} });
    }
    const fab = document.getElementById('fabCreate');
    if (fab && !fab._bound){ fab._bound = true; fab.addEventListener('click', ()=>{ setActiveSection('section-create-tenant'); setStep(1); const form = document.getElementById('tenantForm'); if (form) form.reset(); try{ ensureValidators(); }catch{}; try { fillPlanDropdown(); } catch {} }); }
    setupWizard();
    try { fillPlanDropdown(); } catch {}
  }

  async function fillPlanDropdown(){
    const sel = document.getElementById('pf_planId');
    if (!sel) return;
    try {
      const plans = await (root.API ? root.API.get('/admin/crud/Subscription', { ttl: 30000 }) : (async ()=>{
        const r = await fetch(`${root.API_URL||window.location.origin}/admin/crud/Subscription`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        const j = await r.json(); if (!r.ok) throw new Error(j.error||'Failed to load plans'); return j; })());
      const prev = sel.value;
      sel.innerHTML = '<option value="">—</option>' + (Array.isArray(plans) ? plans.map(p=>`<option value="${p.id}">${p.name} (${p.billing_cycle}) - ${p.price}</option>`).join('') : '');
      if (prev) sel.value = prev;
    } catch(e){ console.warn('Plan dropdown load failed:', e?.message); }
  }

  Admin.Businesses = { setupUI, loadList, submit };
})();
