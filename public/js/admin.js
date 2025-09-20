const API_URL = (window.App && App.API_URL) ? App.API_URL : "http://localhost:3000";

function getToken() { return localStorage.getItem("token"); }
function getUser() { const u = localStorage.getItem("user"); return u ? JSON.parse(u) : null; }

function showAlert(message, type = "success") {
  const box = document.getElementById("alertBox");
  box.className = `alert alert-${type}`;
  box.textContent = message;
  box.classList.remove("d-none");
  setTimeout(() => box.classList.add("d-none"), 4000);
}

// Toast helper
function showToast(message, options = {}) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  const msg = document.createElement('div');
  msg.textContent = message;
  toast.appendChild(msg);
  if (options.linkText && options.onClick) {
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = options.linkText;
    link.addEventListener('click', (e) => { e.preventDefault(); options.onClick(); toast.remove(); });
    toast.appendChild(link);
  }
  const close = document.createElement('button');
  close.className = 'close';
  close.innerHTML = '&times;';
  close.addEventListener('click', () => toast.remove());
  toast.appendChild(close);
  container.appendChild(toast);
  setTimeout(() => toast.remove(), options.timeout || 6000);
}

async function requireAdmin() {
  const token = getToken();
  const user = getUser();
  if (!token || !user) { window.location.href = "index.html"; return; }
  try {
    const resp = await fetch(`${API_URL}/validate-token`, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) throw new Error("invalid token");
    if (user.role !== "SaaS Admin") { window.location.href = "dashboard.html"; }
  } catch (e) {
    localStorage.removeItem("token"); localStorage.removeItem("user"); window.location.href = "index.html";
  }
}

// Sidebar navigation
function setActiveSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
  document.querySelectorAll('#sidebarNav .nav-link').forEach(a => a.classList.toggle('active', a.getAttribute('data-target') === id));
  const title = {
    'section-dashboard': 'Dashboard',
    'section-provision': 'Provision Tenant',
    'section-businesses': 'Businesses',
    'section-subs-all': 'All Subscriptions',
    'section-subs-new': 'New Subscription',
    'section-plans': 'Plans & Pricing',
    'section-my-subscription': 'My Subscription',
    'section-invoices': 'Invoices & Payments',
    'section-features': 'Manage Features',
    'section-renewal': 'Renewal Status',
    'section-payment-methods': 'Payment Methods'
  }[id] || 'SaaS Admin';
  document.getElementById('pageTitle').textContent = title;
  if (id === 'section-dashboard') loadMetrics();
  if (id === 'section-businesses') loadBusinesses();
  if (id === 'section-subs-all') { ensureSubsFiltersBound(); loadAllSubscriptions(); }
  if (id === 'section-subs-new') { ensureSubsNewBound(); }
  if (id === 'section-plans') { if (typeof setupPlansUI==='function') setupPlansUI(); if (typeof loadPlansTable==='function') loadPlansTable(); }
  if (id === 'section-my-subscription') loadMySubscription();
  if (id === 'section-invoices') loadInvoices();
  if (id === 'section-renewal') loadRenewal();
  if (id === 'section-payment-methods') loadPaymentMethods();
  if (id === 'section-features') { if (typeof setupFeaturesUI==='function') setupFeaturesUI(); if (typeof loadFeaturesTable==='function') loadFeaturesTable(); if (typeof loadMatrix==='function') loadMatrix(); }
  // Toggle FAB visibility
  const fab = document.getElementById('fabCreate');
  if (fab) fab.classList.toggle('d-none', id !== 'section-businesses');
}

// Stepper helpers
function setActiveStep(n) {
  document.querySelectorAll('.step-indicator .step').forEach((el) => el.classList.toggle('active', Number(el.dataset.step) === n));
  document.querySelectorAll('[data-step-pane]').forEach((pane) => {
    pane.classList.toggle('d-none', Number(pane.dataset.stepPane) !== n);
  });
}

function collectProvisionData() {
  // Step 1
  const bizName = document.getElementById('pf_bizName').value.trim();
  const bizTier = document.getElementById('pf_bizTier').value;
  const limitsText = document.getElementById('pf_bizLimits').value.trim();
  let limits = {};
  if (limitsText) { try { limits = JSON.parse(limitsText); } catch { throw new Error('Limits must be valid JSON'); } }
  // Step 2
  const owner = {
    fname: document.getElementById('pf_ownerFname').value.trim(),
    mname: document.getElementById('pf_ownerMname').value.trim(),
    lname: document.getElementById('pf_ownerLname').value.trim(),
    email: document.getElementById('pf_ownerEmail').value.trim(),
    temp_password: document.getElementById('pf_ownerTempPass').value,
    business_id: document.getElementById('pf_ownerBizId').value.trim(),
    business_name: document.getElementById('pf_ownerBizName').value.trim(),
  };
  return {
    business: { name: bizName, subscription_tier: bizTier, limits },
    owner
  };
}

function renderReview() {
  const review = document.getElementById('pf_review');
  let data;
  try { data = collectProvisionData(); }
  catch (e) { showAlert(e.message, 'danger'); return; }
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
    </div>
  `;
  review.innerHTML = html;
}

async function submitProvision(e) {
  e.preventDefault();
  const btn = e.submitter || e.target.querySelector('[type="submit"]');
  const orig = btn.textContent; btn.textContent = 'Saving...'; btn.disabled = true;
  try {
    // Collect data from wizard
    const data = collectProvisionData();

    // Step 1: Create Owner (User)
    let ownerId = null;
    if (data.owner?.email) {
      const userPayload = {
        fname: data.owner.fname,
        mname: data.owner.mname,
        lname: data.owner.lname,
        email: data.owner.email,
        phone_number: data.owner.phone_number || '',
        role: 'Owner',
        // First-time OTP will be handled by auth flow later; can optionally set here
      };
      const uRes = await fetch(`${API_URL}/admin/crud/Users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(userPayload)
      });
      const uJson = await uRes.json();
      if (!uRes.ok) throw new Error(uJson.error || 'Failed to create owner');
      ownerId = uJson.id || uJson.recordId || uJson.record_id || null;
    }

    // Step 2: Create Business (link owner_id and plan if provided)
    const bizPayload = {
      name: data.business.name,
      owner_id: ownerId,
      subscription_id: (document.getElementById('pf_planId')?.value || null) || null,
      start_date: document.getElementById('pf_startDate')?.value || null,
      end_date: document.getElementById('pf_endDate')?.value || null,
      logo_url: document.getElementById('pf_logoUrl')?.value || null,
      status: 'active'
    };
    const bRes = await fetch(`${API_URL}/admin/crud/Businesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(bizPayload)
    });
    const bJson = await bRes.json();
    if (!bRes.ok) throw new Error(bJson.error || 'Failed to create business');
    const businessId = bJson.id || bJson.recordId || bJson.record_id || null;

    // Step 3: Optional Branch creation
    const branchName = document.getElementById('pf_branchName')?.value?.trim();
    if (branchName && businessId) {
      const branchPayload = {
        business_id: businessId,
        name: branchName,
        address: document.getElementById('pf_branchAddress')?.value || ''
      };
      const brRes = await fetch(`${API_URL}/admin/crud/Branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(branchPayload)
      });
      const brJson = await brRes.json();
      if (!brRes.ok) throw new Error(brJson.error || 'Failed to create branch');
    }

    showToast('Tenant provisioned successfully', { linkText: 'View Businesses', onClick: ()=> setActiveSection('section-businesses') });
    setActiveSection('section-businesses');
  } catch (err) {
    showAlert(err.message, 'danger');
  } finally { btn.textContent = orig; btn.disabled = false; }
}

async function loadBusinesses() {
  const tbody = document.querySelector('#businessesTable tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" class="text-muted">Loading...</td></tr>`;
  try {
    const resp = await fetch(`${API_URL}/admin/businesses`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Failed to load businesses');
    if (!Array.isArray(data) || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-muted">No businesses yet</td></tr>`; return;
    }
    tbody.innerHTML = data.map(b => {
      const active = (typeof b.is_active === 'boolean') ? (b.is_active ? 'Yes' : 'No') : '—';
      const created = b.created_at ? new Date(b.created_at).toLocaleString() : '—';
      const tier = b.subscription_tier || '—';
      const name = b.name || '—';
      return `<tr><td>${name}</td><td>${tier}</td><td>${active}</td><td>${created}</td></tr>`;
    }).join('');
  } catch (err) {
    showAlert(err.message, 'danger');
    tbody.innerHTML = `<tr><td colspan="4" class="text-danger">${err.message}</td></tr>`;
  }
}

// ---- Subscriptions wiring ----
async function loadPlans(){
  try {
    const resp = await fetch(`${API_URL}/admin/plans`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Failed to load plans');
    const list = document.getElementById('plansList');
    if (list) list.innerHTML = (data||[]).map(p=>{
      const feats = Array.isArray(p.features) ? p.features.map(f=>`<li>${f}</li>`).join('') : '';
      return `<div class="col-md-4"><div class="card h-100"><div class="card-body">
        <h6>${p.name||p.id}</h6>
        <div class="small text-muted mb-1">Monthly: ${p.monthly ?? '—'} | Termly: ${p.termly ?? '—'} | Annual: ${p.annual ?? '—'}</div>
        <ul class="mb-2 small">${feats}</ul>
        <button class="btn btn-outline-secondary btn-sm" data-plan="${p.id||p.name}">Select</button>
      </div></div></div>`;
    }).join('');
  } catch(e){ showAlert(e.message, 'danger'); }
}

async function loadMySubscription(){
  try {
    const resp = await fetch(`${API_URL}/admin/subscription`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Failed to load subscription');
    const plan = document.getElementById('subPlan'); if (plan) plan.textContent = (data.plan||'—').toString();
    const cyc = document.getElementById('subCycle'); if (cyc) cyc.textContent = (data.cycle||'—').toString();
    const ren = document.getElementById('subRenew'); if (ren) ren.textContent = data.renews_on ? new Date(data.renews_on).toLocaleDateString() : '—';
  } catch(e){ showAlert(e.message, 'danger'); }
}

async function loadInvoices(){
  try {
    const resp = await fetch(`${API_URL}/admin/invoices`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Failed to load invoices');
    const tbody = document.getElementById('invoiceTable');
    if (tbody) tbody.innerHTML = (data||[]).map(inv=>{
      const date = inv.date ? new Date(inv.date).toLocaleDateString() : '—';
      const amt = formatCurrency(inv.amount||0);
      const st = inv.status || '—';
      return `<tr><td>${inv.id}</td><td>${date}</td><td>${amt}</td><td>${st}</td><td><button class="btn btn-sm btn-outline-secondary" data-email-invoice="${inv.id}">Email</button></td></tr>`;
    }).join('');
    // Bind email buttons
    document.querySelectorAll('[data-email-invoice]').forEach(btn=>btn.addEventListener('click', async (e)=>{
      const id = e.currentTarget.getAttribute('data-email-invoice');
      try {
        const r = await fetch(`${API_URL}/admin/invoices/${id}/email`, { method:'POST', headers: { Authorization: `Bearer ${getToken()}` } });
        const dj = await r.json();
        if (!r.ok) throw new Error(dj.error || 'Failed to email invoice');
        showToast(dj.message || 'Invoice sent');
      } catch(err){ showAlert(err.message, 'danger'); }
    }));
  } catch(e){ showAlert(e.message, 'danger'); }
}

async function loadRenewal(){
  try {
    const resp = await fetch(`${API_URL}/admin/renewal-status`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Failed to load renewal status');
    const el = document.getElementById('renewalStatus');
    if (el) {
      if (data.state === 'trial') el.textContent = `Trial: ${data.days_left} days left`;
      else if (data.renews_on) el.textContent = `Active: Renews on ${new Date(data.renews_on).toLocaleDateString()} (${data.days_left} days left)`;
      else el.textContent = 'Active';
    }
  } catch(e){ showAlert(e.message, 'danger'); }
}

async function loadPaymentMethods(){
  try {
    const resp = await fetch(`${API_URL}/admin/payment-methods`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Failed to load payment methods');
    const list = document.getElementById('paymentMethodsList');
    if (list) list.innerHTML = (data||[]).map(pm=>{
      const desc = pm.id === 'cash' ? 'Record cash payments' : (pm.id === 'mobile_money' ? 'MTN, Airtel etc.' : 'Secure card payments');
      return `<div class="col-md-4"><div class="card h-100"><div class="card-body"><h6>${pm.name}</h6><p class="small text-muted mb-2">${desc}</p><button class="btn btn-outline-secondary btn-sm" data-use-payment="${pm.id}">Use</button></div></div></div>`;
    }).join('');
  } catch(e){ showAlert(e.message, 'danger'); }
}

function setupNav() {
  const sidebar = document.getElementById('sidebarNav');
  sidebar.addEventListener('click', (e) => {
    const toggle = e.target.closest('.nav-group-toggle');
    if (toggle) {
      e.preventDefault();
      const groupId = toggle.getAttribute('data-group');
      const group = document.getElementById(groupId);
      if (group) group.classList.toggle('d-none');
      toggle.classList.toggle('open');
      return;
    }
    const a = e.target.closest('a[data-target]');
    if (!a) return;
    e.preventDefault();
    const target = a.getAttribute('data-target');
    setActiveSection(target);
  });
  document.querySelectorAll('[data-jump]').forEach(btn => btn.addEventListener('click', (e) => {
    const target = e.currentTarget.getAttribute('data-jump');
    setActiveSection(target);
  }));

  // Create button to open provision wizard
  const createBtn = document.getElementById('createBusinessBtn');
  if (createBtn) createBtn.addEventListener('click', () => {
    setActiveSection('section-provision');
    setActiveStep(1);
    const form = document.getElementById('provisionForm'); if (form) form.reset();
  });

  // FAB Create
  const fab = document.getElementById('fabCreate');
  if (fab) fab.addEventListener('click', () => {
    setActiveSection('section-provision');
    setActiveStep(1);
    const form = document.getElementById('provisionForm'); if (form) form.reset();
  });
}

function setupSteps() {
  // initialize step to 1
  setActiveStep(1);
  document.querySelectorAll('#provisionForm [data-next]').forEach(btn => btn.addEventListener('click', (e) => {
    e.preventDefault();
    const curr = Number(document.querySelector('.step-indicator .step.active')?.dataset.step || 1);
    const next = Math.min(3, curr + 1);
    setActiveStep(next);
    if (next === 3) renderReview();
  }));
  document.querySelectorAll('#provisionForm [data-prev]').forEach(btn => btn.addEventListener('click', (e) => {
    e.preventDefault();
    const curr = Number(document.querySelector('.step-indicator .step.active')?.dataset.step || 1);
    const prev = Math.max(1, curr - 1);
    setActiveStep(prev);
  }));
  // Cancel buttons -> back to Businesses
  document.querySelectorAll('#provisionForm [data-cancel]').forEach(btn => btn.addEventListener('click', (e) => {
    e.preventDefault();
    setActiveSection('section-businesses');
  }));
  document.getElementById('provisionForm').addEventListener('submit', submitProvision);
}

// ---- Dashboard Metrics ----
let revenueChart, plansChart;
function formatCurrency(n) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n || 0)); } catch { return Number(n || 0).toLocaleString(); }
}

function renderKPIs(cards) {
  const c = cards || {};
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('kpiTotalBiz', c.totalBusinesses ?? '—');
  set('kpiRegistered', c.totalRegistered ?? '—');
  set('kpiActiveSubs', c.activeSubscriptions ?? '—');
  set('kpiMonthlyRevenue', formatCurrency(c.monthlyRevenue ?? 0));
}

function renderCharts(charts) {
  const colors = (window.App && App.colors) ? App.colors : { primary: '#0d6efd', series: ['#0d6efd', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a78bfa', '#14b8a6'] };
  const revEl = document.getElementById('chartRevenue');
  const planEl = document.getElementById('chartPlans');
  if (!revEl || !planEl || typeof Chart === 'undefined') return;
  if (revenueChart) revenueChart.destroy();
  if (plansChart) plansChart.destroy();
  const rev = charts?.revenue || { labels: [], data: [] };
  const pln = charts?.plans || { labels: [], data: [] };
  revenueChart = new Chart(revEl.getContext('2d'), {
    type: 'line',
    data: { labels: rev.labels, datasets: [{ label: 'Revenue', data: rev.data, borderColor: colors.primary, backgroundColor: colors.primary + '33', tension: .25, fill: true }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: (v) => formatCurrency(v) } } } }
  });
  plansChart = new Chart(planEl.getContext('2d'), {
    type: 'doughnut',
    data: { labels: pln.labels, datasets: [{ data: pln.data, backgroundColor: colors.series.slice(0, pln.labels.length) }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });
}

function renderRecent(rows) {
  const tbody = document.querySelector('#recentTable tbody');
  if (!tbody) return;
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) { tbody.innerHTML = `<tr><td colspan="3" class="text-muted">No recent registrations</td></tr>`; return; }
  tbody.innerHTML = list.map(r => {
    const created = r.created_at ? new Date(r.created_at).toLocaleString() : '—';
    return `<tr><td>${r.name}</td><td>${r.tier}</td><td>${created}</td></tr>`;
  }).join('');
}

async function loadMetrics() {
  try {
    const resp = await fetch(`${API_URL}/admin/metrics`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Failed to load metrics');
    renderKPIs(data.cards);
    renderCharts(data.charts);
    renderRecent(data.recent);
    const churn = document.getElementById('kpiChurn'); if (churn) churn.textContent = ((data.churnRate ?? 0) + '%');
    const up = document.getElementById('kpiUptime'); if (up) up.textContent = (data.uptimeHours ?? 0).toString();

    // Seed simple notifications and toggle badge dot
    const list = document.getElementById('notifList');
    const dot = document.getElementById('notifDot');
    if (list) {
      const items = [];
      if (Array.isArray(data.recent)) {
        data.recent.slice(0, 2).forEach(r => items.push(`New business registered: ${r.name}`));
      }
      if ((data.cards?.activeSubscriptions ?? 0) > 0) items.push('Payment received: Subscriptions active');
      if (items.length === 0) {
        list.innerHTML = '<div class="text-muted small px-3 py-2">No new notifications</div>';
        if (dot) dot.classList.add('d-none');
      } else {
        list.innerHTML = items.map(t => `<div class="px-3 py-2 small">${t}</div>`).join('');
        if (dot) dot.classList.remove('d-none');
      }
    }
  } catch (e) {
    showAlert(e.message, 'danger');
  }
}

function setupToolbar() {
  // Refresh (if present)
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', () => {
    const active = document.querySelector('.section.active')?.id;
    if (active === 'section-businesses') loadBusinesses();
    if (active === 'section-dashboard') loadMetrics();
  });
  const reloadRecent = document.getElementById('reloadRecent');
  if (reloadRecent) reloadRecent.addEventListener('click', loadMetrics);

  // Theme toggle
  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    const current = localStorage.getItem('theme') || 'light';
    if (current === 'dark') { document.body.classList.add('dark'); themeBtn.textContent = '☀️'; }
    themeBtn.addEventListener('click', () => {
      const isDark = document.body.classList.toggle('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      themeBtn.textContent = isDark ? '☀️' : '🌙';
    });
  }

  // Dropdowns (simple custom)
  const notifBtn = document.getElementById('notifBtn');
  const notifMenu = document.getElementById('notifMenu');
  if (notifBtn && notifMenu) {
    notifBtn.addEventListener('click', (e) => { e.stopPropagation(); notifMenu.classList.toggle('show'); });
    document.addEventListener('click', () => notifMenu.classList.remove('show'));
  }
  const profileBtn = document.getElementById('profileBtn');
  const profileMenu = document.getElementById('profileMenu');
  if (profileBtn && profileMenu) {
    profileBtn.addEventListener('click', (e) => { e.stopPropagation(); profileMenu.classList.toggle('show'); });
    document.addEventListener('click', () => profileMenu.classList.remove('show'));
  }
  const logoutAction = document.getElementById('logoutAction');
  if (logoutAction) logoutAction.addEventListener('click', () => {
    localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = 'index.html';
  });

  // Populate profile name and avatar initials
  const u = getUser();
  if (u) {
    const name = [u.fname, u.lname].filter(Boolean).join(' ') || u.email || 'User';
    const el = document.getElementById('profileName'); if (el) el.textContent = name;
    const av = document.getElementById('profileAvatar');
    if (av) {
      const initials = (u.fname?.[0] || '') + (u.lname?.[0] || (u.email ? u.email[0] : 'U'));
      av.textContent = initials.toUpperCase();
    }
  }

  // Subscriptions actions (placeholder)
  const emailBtn = document.getElementById('emailInvoice');
  if (emailBtn) emailBtn.addEventListener('click', () => showToast('Invoice sent via email'));
  const saveFeat = document.getElementById('saveFeatures');
  if (saveFeat) saveFeat.addEventListener('click', () => showToast('Features updated'));

  // Wire My Subscription buttons
const upBtn = document.getElementById('upgradePlan');
if (upBtn) upBtn.addEventListener('click', async ()=> {
  try {
    const r = await fetch(`${API_URL}/admin/subscription/upgrade`, { method:'POST', headers: { 'Content-Type':'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ plan: 'pro' }) });
    const dj = await r.json(); if (!r.ok) throw new Error(dj.error || 'Upgrade failed');
    showToast(dj.message || 'Upgraded'); loadMySubscription();
  } catch(e){ showAlert(e.message, 'danger'); }
});

const downBtn = document.getElementById('downgradePlan');
if (downBtn) downBtn.addEventListener('click', async ()=> {
  try {
    const r = await fetch(`${API_URL}/admin/subscription/downgrade`, { method:'POST', headers: { 'Content-Type':'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ plan: 'starter' }) });
    const dj = await r.json(); if (!r.ok) throw new Error(dj.error || 'Downgrade failed');
    showToast(dj.message || 'Downgraded'); loadMySubscription();
  } catch(e){ showAlert(e.message, 'danger'); }
});

const editBtn = document.getElementById('editPlan');
if (editBtn) editBtn.addEventListener('click', async ()=> {
  try {
    // demo toggle cycle
    const curr = document.getElementById('subCycle')?.textContent?.trim().toLowerCase();
    const nextCycle = curr === 'annual' ? 'monthly' : 'annual';
    const r = await fetch(`${API_URL}/admin/subscription/edit`, { method:'POST', headers: { 'Content-Type':'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ billing_cycle: nextCycle }) });
    const dj = await r.json(); if (!r.ok) throw new Error(dj.error || 'Edit failed');
    showToast(`Billing cycle set to ${nextCycle}`); loadMySubscription();
  } catch(e){ showAlert(e.message, 'danger'); }
});
}

function setup() {
  requireAdmin();
  setupNav();
  setupSteps();
  setupToolbar();
  // initial load
  loadMetrics();
  // Ensure FAB hidden on initial dashboard
  const fab = document.getElementById('fabCreate'); if (fab) fab.classList.add('d-none');
}

document.addEventListener('DOMContentLoaded', setup);

// ---- SaaS Admin: All Subscriptions ----
function readSubsFilters(){
  const status = (document.getElementById('subsFilterStatus')?.value || '').trim();
  const owner = (document.getElementById('subsFilterOwner')?.value || '').trim();
  const from = (document.getElementById('subsFilterFrom')?.value || '').trim();
  const to = (document.getElementById('subsFilterTo')?.value || '').trim();
  return { status, owner, from, to };
}

async function loadAllSubscriptions(){
  try {
    const f = readSubsFilters();
    const qp = new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([_,v])=>v)));
    const url = `${API_URL}/admin/subscriptions${qp.toString() ? ('?' + qp.toString()) : ''}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Failed to load subscriptions');
    const tbody = document.getElementById('subsTable');
    if (!tbody) return;
    if (!Array.isArray(data) || data.length === 0) { tbody.innerHTML = `<tr><td colspan="6" class="text-muted">No subscriptions found</td></tr>`; return; }
    tbody.innerHTML = data.map(s=>{
      const start = s.start_date ? new Date(s.start_date).toLocaleDateString() : '—';
      const renew = s.renewed_at ? new Date(s.renewed_at).toLocaleDateString() : '—';
      return `<tr><td>${s.business||'—'}</td><td>${s.owner||'—'}</td><td>${s.plan||'—'}</td><td>${s.status||'—'}</td><td>${start}</td><td>${renew}</td></tr>`;
    }).join('');
  } catch(e){ showAlert(e.message, 'danger'); }
}

let subsFiltersBound = false;
function ensureSubsFiltersBound(){
  if (subsFiltersBound) return;
  subsFiltersBound = true;
  const apply = document.getElementById('subsFilterApply');
  if (apply) apply.addEventListener('click', (e)=>{ e.preventDefault(); loadAllSubscriptions(); });
  const clear = document.getElementById('subsFilterClear');
  if (clear) clear.addEventListener('click', (e)=>{
    e.preventDefault();
    const ids = ['subsFilterStatus','subsFilterOwner','subsFilterFrom','subsFilterTo'];
    ids.forEach(id=>{ const el = document.getElementById(id); if (el) el.value = ''; });
    loadAllSubscriptions();
  });
}

// ---- SaaS Admin: New Subscription (Manual Add) ----
let subsNewBound = false;
function ensureSubsNewBound(){
  if (subsNewBound) return; subsNewBound = true;
  const form = document.getElementById('subsNewForm');
  if (!form) return;
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]');
    const orig = btn?.textContent; if (btn){ btn.textContent = 'Saving...'; btn.disabled = true; }
    try {
      const payload = {
        business_id: document.getElementById('sn_business_id')?.value?.trim(),
        owner_email: document.getElementById('sn_owner_email')?.value?.trim(),
        plan: document.getElementById('sn_plan')?.value,
        billing_cycle: document.getElementById('sn_cycle')?.value,
        start_date: document.getElementById('sn_start')?.value || undefined,
        amount: Number(document.getElementById('sn_amount')?.value || 0)
      };
      if (!payload.business_id || !payload.owner_email) throw new Error('Business ID and Owner Email are required');
      const resp = await fetch(`${API_URL}/admin/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to create subscription');
      showToast('Subscription created', { linkText: 'View All', onClick: ()=> setActiveSection('section-subs-all') });
      form.reset();
    } catch(err){ showAlert(err.message, 'danger'); }
    finally { if (btn){ btn.textContent = orig; btn.disabled = false; } }
  });
}

// ===== Advanced Plans & Features Managers (CRUD + Matrix) =====
// Lightweight modal helper (no Bootstrap dependency required)
let planModal, featureModal;
function bsModal(id){
  const el = document.getElementById(id);
  if (!el) return null;
  return {
    show(){ el.style.display='block'; el.classList.add('show'); },
    hide(){ el.classList.remove('show'); el.style.display='none'; }
  };
}

// ---- Plans (Subscription table) ----
function setupPlansUI(){
  if (!planModal) planModal = bsModal('planModal');
  const newBtn = document.getElementById('btnNewPlan');
  if (newBtn && !newBtn._bound){ newBtn._bound = true; newBtn.addEventListener('click', ()=> openPlanForm()); }
  const saveBtn = document.getElementById('planSaveBtn');
  if (saveBtn && !saveBtn._bound){ saveBtn._bound = true; saveBtn.addEventListener('click', savePlan); }
}

async function loadPlansTable(){
  try{
    const res = await fetch(`${API_URL}/admin/crud/Subscription`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const items = await res.json();
    if (!res.ok) throw new Error(items.error || 'Failed to load plans');
    const tbody = document.getElementById('plansTable'); if (!tbody) return;
    if (!Array.isArray(items) || items.length===0){ tbody.innerHTML = `<tr><td colspan="5" class="text-muted">No plans yet</td></tr>`; return; }
    tbody.innerHTML = items.map(p=>{
      const active = (typeof p.is_active === 'boolean') ? (p.is_active ? 'Yes' : 'No') : '—';
      return `<tr>
        <td>${p.name||'—'}</td>
        <td>${formatCurrency(p.price||0)}</td>
        <td>${p.billing_cycle||'—'}</td>
        <td>${active}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary" data-edit-plan="${p.id}">Edit</button>
          <button class="btn btn-sm btn-outline-danger ms-1" data-del-plan="${p.id}">Delete</button>
        </td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-edit-plan]').forEach(b=>b.addEventListener('click',(e)=>{
      const id = e.currentTarget.getAttribute('data-edit-plan');
      const p = items.find(x=>String(x.id)===String(id));
      openPlanForm(p);
    }));
    tbody.querySelectorAll('[data-del-plan]').forEach(b=>b.addEventListener('click', async (e)=>{
      const id = e.currentTarget.getAttribute('data-del-plan');
      if (!confirm('Delete this plan?')) return;
      const r = await fetch(`${API_URL}/admin/crud/Subscription/${id}`, { method:'DELETE', headers:{ Authorization:`Bearer ${getToken()}` } });
      const dj = await r.json(); if (!r.ok) return showAlert(dj.error||'Delete failed','danger');
      showToast('Plan deleted'); loadPlansTable(); if (typeof loadMatrix==='function') loadMatrix();
    }));
  }catch(e){ showAlert(e.message,'danger'); }
}

function openPlanForm(p){
  const idEl = document.getElementById('plan_id'); if (!idEl) return;
  idEl.value = p?.id || '';
  const nameEl = document.getElementById('plan_name'); if (nameEl) nameEl.value = p?.name || '';
  const priceEl = document.getElementById('plan_price'); if (priceEl) priceEl.value = p?.price ?? '';
  const cycleEl = document.getElementById('plan_cycle'); if (cycleEl) cycleEl.value = p?.billing_cycle || 'monthly';
  const actEl = document.getElementById('plan_active'); if (actEl) actEl.checked = (typeof p?.is_active === 'boolean') ? !!p.is_active : true;
  planModal?.show();
}

async function savePlan(){
  try{
    const id = document.getElementById('plan_id')?.value?.trim();
    const payload = {
      name: document.getElementById('plan_name')?.value?.trim(),
      price: Number(document.getElementById('plan_price')?.value || 0),
      billing_cycle: document.getElementById('plan_cycle')?.value,
      is_active: !!document.getElementById('plan_active')?.checked
    };
    const url = id ? `${API_URL}/admin/crud/Subscription/${id}` : `${API_URL}/admin/crud/Subscription`;
    const method = id ? 'PATCH' : 'POST';
    const r = await fetch(url, { method, headers: { 'Content-Type':'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify(payload) });
    const dj = await r.json(); if (!r.ok) throw new Error(dj.error || 'Save failed');
    planModal?.hide(); showToast('Plan saved'); loadPlansTable(); if (typeof loadMatrix==='function') loadMatrix();
  }catch(e){ showAlert(e.message,'danger'); }
}

// ---- Features and Plan×Feature matrix ----
function setupFeaturesUI(){
  if (!featureModal) featureModal = bsModal('featureModal');
  const newBtn = document.getElementById('btnNewFeature');
  if (newBtn && !newBtn._bound){ newBtn._bound = true; newBtn.addEventListener('click', ()=> openFeatureForm()); }
  const saveBtn = document.getElementById('featureSaveBtn');
  if (saveBtn && !saveBtn._bound){ saveBtn._bound = true; saveBtn.addEventListener('click', saveFeature); }
  const saveMx = document.getElementById('btnSaveMatrix');
  if (saveMx && !saveMx._bound){ saveMx._bound = true; saveMx.addEventListener('click', saveMatrix); }
}

async function loadFeaturesTable(){
  try{
    const res = await fetch(`${API_URL}/admin/crud/Features`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const items = await res.json();
    if (!res.ok) throw new Error(items.error || 'Failed to load features');
    const tbody = document.getElementById('featuresTable'); if (!tbody) return;
    if (!Array.isArray(items) || items.length===0){ tbody.innerHTML = `<tr><td colspan="4" class="text-muted">No features</td></tr>`; return; }
    tbody.innerHTML = items.map(f=>{
      const active = (typeof f.is_active === 'boolean') ? (f.is_active ? 'Yes' : 'No') : '—';
      return `<tr>
        <td>${f.name||'—'}</td>
        <td><code>${f.code||''}</code></td>
        <td>${active}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary" data-edit-feature="${f.id}">Edit</button>
          <button class="btn btn-sm btn-outline-danger ms-1" data-del-feature="${f.id}">Delete</button>
        </td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-edit-feature]').forEach(b=>b.addEventListener('click',(e)=>{
      const id = e.currentTarget.getAttribute('data-edit-feature');
      const f = items.find(x=>String(x.id)===String(id));
      openFeatureForm(f);
    }));
    tbody.querySelectorAll('[data-del-feature]').forEach(b=>b.addEventListener('click', async (e)=>{
      const id = e.currentTarget.getAttribute('data-del-feature');
      if (!confirm('Delete this feature?')) return;
      const r = await fetch(`${API_URL}/admin/crud/Features/${id}`, { method:'DELETE', headers:{ Authorization:`Bearer ${getToken()}` } });
      const dj = await r.json(); if (!r.ok) return showAlert(dj.error||'Delete failed','danger');
      showToast('Feature deleted'); loadFeaturesTable(); if (typeof loadMatrix==='function') loadMatrix();
    }));
  }catch(e){ showAlert(e.message,'danger'); }
}

function openFeatureForm(f){
  const idEl = document.getElementById('feature_id'); if (!idEl) return;
  idEl.value = f?.id || '';
  const n = document.getElementById('feature_name'); if (n) n.value = f?.name || '';
  const c = document.getElementById('feature_code'); if (c) c.value = f?.code || '';
  const d = document.getElementById('feature_desc'); if (d) d.value = f?.description || '';
  const a = document.getElementById('feature_active'); if (a) a.checked = (typeof f?.is_active === 'boolean') ? !!f.is_active : true;
  featureModal?.show();
}

async function saveFeature(){
  try{
    const id = document.getElementById('feature_id')?.value?.trim();
    const payload = {
      name: document.getElementById('feature_name')?.value?.trim(),
      code: document.getElementById('feature_code')?.value?.trim() || undefined,
      description: document.getElementById('feature_desc')?.value?.trim(),
      is_active: !!document.getElementById('feature_active')?.checked
    };
    const url = id ? `${API_URL}/admin/crud/Features/${id}` : `${API_URL}/admin/crud/Features`;
    const method = id ? 'PATCH' : 'POST';
    const r = await fetch(url, { method, headers: { 'Content-Type':'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify(payload) });
    const dj = await r.json(); if (!r.ok) throw new Error(dj.error || 'Save failed');
    featureModal?.hide(); showToast('Feature saved'); loadFeaturesTable(); if (typeof loadMatrix==='function') loadMatrix();
  }catch(e){ showAlert(e.message,'danger'); }
}

async function loadMatrix(){
  const container = document.getElementById('featureMatrix'); if (!container) return;
  try{
    const [plansRes, featsRes, mapRes] = await Promise.all([
      fetch(`${API_URL}/admin/crud/Subscription`, { headers: { Authorization: `Bearer ${getToken()}` } }),
      fetch(`${API_URL}/admin/crud/Features`, { headers: { Authorization: `Bearer ${getToken()}` } }),
      fetch(`${API_URL}/admin/crud/Subscription_Features`, { headers: { Authorization: `Bearer ${getToken()}` } }),
    ]);
    const plans = await plansRes.json(); if (!plansRes.ok) throw new Error(plans.error||'Plans load failed');
    const feats = await featsRes.json(); if (!featsRes.ok) throw new Error(feats.error||'Features load failed');
    const maps = await mapRes.json(); if (!mapRes.ok) throw new Error(maps.error||'Map load failed');
    const header = `<thead><tr><th>Feature</th>${plans.map(p=>`<th class=\"text-center\">${p.name}</th>`).join('')}</tr></thead>`;
    const body = `<tbody>${feats.map(f=>{
      return `<tr><td>${f.name} <small class=\"text-muted\">${f.code||''}</small></td>${plans.map(p=>{
        const existing = maps.find(m=>String(m.subscription_id)===String(p.id) && String(m.feature_id)===String(f.id));
        const checked = existing ? 'checked' : '';
        const limit = existing?.limit_value || '';
        const mapId = existing?.id || '';
        return `<td class=\"text-center\">\n          <input type=\"checkbox\" class=\"form-check-input align-middle\" data-mx=\"${p.id}:${f.id}\" ${checked} />\n          <input type=\"text\" class=\"form-control form-control-sm mt-1\" placeholder=\"limit\" data-mx-limit=\"${p.id}:${f.id}\" value=\"${limit}\" />\n          <input type=\"hidden\" data-mx-id=\"${p.id}:${f.id}\" value=\"${mapId}\">\n        </td>`;
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
      if (op.a==='c') await fetch(`${API_URL}/admin/crud/Subscription_Features`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${getToken()}` }, body: JSON.stringify(op.p) });
      else if (op.a==='u') await fetch(`${API_URL}/admin/crud/Subscription_Features/${op.id}`, { method:'PATCH', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${getToken()}` }, body: JSON.stringify(op.p) });
      else if (op.a==='d') await fetch(`${API_URL}/admin/crud/Subscription_Features/${op.id}`, { method:'DELETE', headers:{ Authorization:`Bearer ${getToken()}` } });
    }
    showToast('Feature matrix saved'); await loadMatrix();
  }catch(e){ showAlert(e.message,'danger'); }
}

// Add this to admin.js

// Global variables
let plans = [];

// DOM Ready
document.addEventListener('DOMContentLoaded', function() {
    loadPlans();
    setupPlanForm();
});

// Load Plans
async function loadPlans() {
    try {
        const response = await fetch('/api/plans');
        if (!response.ok) throw new Error('Failed to load plans');
        plans = await response.json();
        renderPlansTable();
    } catch (error) {
        showAlert('Error loading plans: ' + error.message, 'danger');
    }
}

// Render Plans Table
function renderPlansTable() {
    const tbody = document.getElementById('plansTableBody');
    tbody.innerHTML = '';
    
    plans.forEach(plan => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(plan.name)}</td>
            <td>$${parseFloat(plan.price_monthly).toFixed(2)}</td>
            <td>$${parseFloat(plan.price_annual).toFixed(2)}</td>
            <td>${plan.max_staff}</td>
            <td>${plan.max_branches}</td>
            <td><span class="badge ${plan.status === 'Active' ? 'bg-success' : 'bg-secondary'}">${plan.status}</span></td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="editPlan(${plan.id})">
                    <i class="bi bi-pencil"></i> Edit
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deletePlan(${plan.id})">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ===== Plan Management =====
let plans = [];

function setupPlans() {
    const form = document.getElementById('planForm');
    if (!form) return;

    // Load plans if on the plans page
    if (window.location.hash === '#section-plans') {
        loadPlans();
    }

    // Handle form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await savePlan();
    });

    // Add event listeners for plan actions
    document.addEventListener('click', (e) => {
        if (e.target.matches('[data-edit-plan]') || e.target.closest('[data-edit-plan]')) {
            const planId = (e.target.dataset.editPlan || e.target.closest('[data-edit-plan]').dataset.editPlan);
            editPlan(planId);
        } else if (e.target.matches('[data-delete-plan]') || e.target.closest('[data-delete-plan]')) {
            const planId = (e.target.dataset.deletePlan || e.target.closest('[data-delete-plan]').dataset.deletePlan);
            deletePlan(planId);
        }
    });
}

// Load plans from server
async function loadPlans() {
    try {
        const response = await fetch('/api/plans', {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        if (!response.ok) throw new Error('Failed to load plans');
        
        plans = await response.json();
        renderPlansTable();
    } catch (error) {
        console.error('Error loading plans:', error);
        showToast('Failed to load plans: ' + error.message, 'danger');
    }
}

// Render plans in the table
function renderPlansTable() {
    const tbody = document.getElementById('plansTableBody');
    if (!tbody) return;
    
    if (!plans || plans.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No plans found. Click "Add New Plan" to get started.</td></tr>';
        return;
    }
    
    tbody.innerHTML = plans.map(plan => `
        <tr>
            <td>${escapeHtml(plan.name)}</td>
            <td>$${parseFloat(plan.price_monthly || 0).toFixed(2)}</td>
            <td>$${parseFloat(plan.price_annual || 0).toFixed(2)}</td>
            <td>${plan.max_staff || 0}</td>
            <td>${plan.max_branches || 0}</td>
            <td>
                <span class="badge ${plan.status === 'Active' ? 'bg-success' : 'bg-secondary'}">
                    ${plan.status || 'Inactive'}
                </span>
            </td>
            <td class="text-nowrap">
                <button class="btn btn-sm btn-outline-primary me-1" data-edit-plan="${plan.id}">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" data-delete-plan="${plan.id}">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// Show plan form for editing or creating a new plan
function showPlanForm(plan = null) {
    const container = document.getElementById('planFormContainer');
    const tableContainer = document.getElementById('plansTableContainer');
    if (!container || !tableContainer) return;
    
    const form = document.getElementById('planForm');
    form.reset();
    form.classList.remove('was-validated');
    
    if (plan) {
        // Editing existing plan
        document.getElementById('planId').value = plan.id;
        document.getElementById('planName').value = plan.name || '';
        document.getElementById('planStatus').value = plan.status || 'Active';
        document.getElementById('monthlyPrice').value = plan.price_monthly || '';
        document.getElementById('termlyPrice').value = plan.price_termly || '';
        document.getElementById('annualPrice').value = plan.price_annual || '';
        document.getElementById('maxStaff').value = plan.max_staff || 1;
        document.getElementById('maxStudents').value = plan.max_students || '';
        document.getElementById('maxBranches').value = plan.max_branches || 1;
        document.getElementById('planFeatures').value = plan.features || '';
    } else {
        // New plan
        document.getElementById('planId').value = '';
        document.getElementById('planStatus').value = 'Active';
        document.getElementById('maxStaff').value = '1';
        document.getElementById('maxBranches').value = '1';
    }
    
    tableContainer.style.display = 'none';
    container.style.display = 'block';
    
    // Focus on the first input
    const firstInput = form.querySelector('input, select, textarea');
    if (firstInput) firstInput.focus();
}

// Hide the plan form
function hidePlanForm() {
    const container = document.getElementById('planFormContainer');
    const tableContainer = document.getElementById('plansTableContainer');
    
    if (container) container.style.display = 'none';
    if (tableContainer) tableContainer.style.display = 'block';
}

// Save plan (create or update)
async function savePlan() {
    const form = document.getElementById('planForm');
    if (!form) return;
    
    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        return;
    }
    
    const saveBtn = form.querySelector('button[type="submit"]');
    const spinner = document.getElementById('savePlanSpinner');
    const planId = document.getElementById('planId').value;
    
    try {
        // Show loading state
        saveBtn.disabled = true;
        if (spinner) spinner.classList.remove('d-none');
        
        const planData = {
            name: document.getElementById('planName').value.trim(),
            status: document.getElementById('planStatus').value,
            price_monthly: parseFloat(document.getElementById('monthlyPrice').value),
            price_termly: document.getElementById('termlyPrice').value ? 
                         parseFloat(document.getElementById('termlyPrice').value) : null,
            price_annual: parseFloat(document.getElementById('annualPrice').value),
            max_staff: parseInt(document.getElementById('maxStaff').value),
            max_students: document.getElementById('maxStudents').value ? 
                         parseInt(document.getElementById('maxStudents').value) : null,
            max_branches: parseInt(document.getElementById('maxBranches').value),
            features: document.getElementById('planFeatures').value.trim()
        };
        
        const url = planId ? `/api/plans/${planId}` : '/api/plans';
        const method = planId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(planData)
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || 'Failed to save plan');
        }
        
        showToast(`Plan ${planId ? 'updated' : 'created'} successfully`, 'success');
        await loadPlans();
        hidePlanForm();
    } catch (error) {
        console.error('Error saving plan:', error);
        showToast(error.message || 'Failed to save plan', 'danger');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
        if (spinner) spinner.classList.add('d-none');
    }
}

// Edit a plan
function editPlan(planId) {
    const plan = plans.find(p => p.id.toString() === planId.toString());
    if (!plan) {
        showToast('Plan not found', 'danger');
        return;
    }
    showPlanForm(plan);
}

// Delete a plan
async function deletePlan(planId) {
    if (!confirm('Are you sure you want to delete this plan? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/plans/${planId}`, { 
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || 'Failed to delete plan');
        }
        
        showToast('Plan deleted successfully', 'success');
        await loadPlans();
    } catch (error) {
        console.error('Error deleting plan:', error);
        showToast(error.message || 'Failed to delete plan', 'danger');
    }
}

///
// Show Plan Form
function showPlanForm(plan = null) {
    const form = document.getElementById('planForm');
    form.reset();
    
    if (plan) {
        document.getElementById('planId').value = plan.id;
        document.getElementById('planName').value = plan.name;
        document.getElementById('planStatus').value = plan.status;
        document.getElementById('monthlyPrice').value = plan.price_monthly;
        document.getElementById('termlyPrice').value = plan.price_termly || '';
        document.getElementById('annualPrice').value = plan.price_annual;
        document.getElementById('maxStaff').value = plan.max_staff;
        document.getElementById('maxStudents').value = plan.max_students || '';
        document.getElementById('maxBranches').value = plan.max_branches;
        document.getElementById('planFeatures').value = plan.features || '';
    }
    
    document.getElementById('plansTableContainer').style.display = 'none';
    document.getElementById('planFormContainer').style.display = 'block';
}

// Hide Plan Form
function hidePlanForm() {
    document.getElementById('plansTableContainer').style.display = 'block';
    document.getElementById('planFormContainer').style.display = 'none';
}

// Setup Plan Form Submit
function setupPlanForm() {
    const form = document.getElementById('planForm');
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const planData = {
            name: document.getElementById('planName').value.trim(),
            status: document.getElementById('planStatus').value,
            price_monthly: parseFloat(document.getElementById('monthlyPrice').value),
            price_termly: document.getElementById('termlyPrice').value ? 
                         parseFloat(document.getElementById('termlyPrice').value) : null,
            price_annual: parseFloat(document.getElementById('annualPrice').value),
            max_staff: parseInt(document.getElementById('maxStaff').value),
            max_students: document.getElementById('maxStudents').value ? 
                         parseInt(document.getElementById('maxStudents').value) : null,
            max_branches: parseInt(document.getElementById('maxBranches').value),
            features: document.getElementById('planFeatures').value.trim()
        };
        
        const planId = document.getElementById('planId').value;
        const url = planId ? `/api/plans/${planId}` : '/api/plans';
        const method = planId ? 'PUT' : 'POST';
        
        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(planData)
            });
            
            if (!response.ok) throw new Error('Failed to save plan');
            
            showAlert(`Plan ${planId ? 'updated' : 'created'} successfully`, 'success');
            await loadPlans();
            hidePlanForm();
        } catch (error) {
            showAlert('Error: ' + error.message, 'danger');
        }
    });
}

// Edit Plan
function editPlan(planId) {
    const plan = plans.find(p => p.id === planId);
    if (plan) showPlanForm(plan);
}

// Delete Plan
async function deletePlan(planId) {
    if (!confirm('Are you sure you want to delete this plan?')) return;
    
    try {
        const response = await fetch(`/api/plans/${planId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete plan');
        
        showAlert('Plan deleted successfully', 'success');
        await loadPlans();
    } catch (error) {
        showAlert('Error: ' + error.message, 'danger');
    }
}

// Helper function to escape HTML
function escapeHtml(unsafe) {
    return unsafe
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Helper function to show alerts
function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.role = 'alert';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    const container = document.querySelector('.container');
    container.insertBefore(alertDiv, container.firstChild);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}