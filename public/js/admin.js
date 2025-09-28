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

// Lightweight modal helper: uses Bootstrap if available, else falls back
function bsModal(id){
  const el = document.getElementById(id);
  if (!el) return null;
  if (window.bootstrap && bootstrap.Modal){
    return new bootstrap.Modal(el);
  }
  // Fallback minimal modal controller with ARIA + focus management
  let prevFocus = null;
  let keyHandler = null;
  let backdrop = null;
  const focusableSelector = 'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const getFocusable = () => Array.from(el.querySelectorAll(focusableSelector)).filter(n=> n.offsetParent !== null);
  const setBackgroundInert = (on) => {
    try {
      Array.from(document.body.children).forEach(node => {
        if (node === el) return;
        if (on) node.setAttribute('inert', ''); else node.removeAttribute('inert');
      });
    } catch {}
  };
  const addDismissHandlers = ()=>{
    try {
      el.querySelectorAll('[data-bs-dismiss="modal"]').forEach(btn => {
        if (btn._boundDismiss) return; btn._boundDismiss = true;
        btn.addEventListener('click', (e) => { e.preventDefault(); api.hide(); });
      });
    } catch {}
  };
  const api = {
    show(){
      // ARIA & role
      el.setAttribute('role', 'dialog');
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      el.removeAttribute('aria-hidden');
      el.setAttribute('aria-modal', 'true');
      // Backdrop
      try {
        backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop show';
        document.body.appendChild(backdrop);
      } catch {}
      // Visual
      el.classList.add('show');
      el.style.display = 'block';
      try { document.body.classList.add('modal-open'); } catch {}
      // Focus
      try {
        prevFocus = document.activeElement;
        const f = getFocusable();
        if (f.length) f[0].focus(); else el.focus();
        keyHandler = (ev)=>{ if (ev.key === 'Escape') { ev.preventDefault(); api.hide(); } };
        document.addEventListener('keydown', keyHandler, true);
      } catch {}
      // Prevent interacting with background
      setBackgroundInert(true);
      addDismissHandlers();
    },
    hide(){
      // Move focus OUT first to avoid aria-hidden warning
      try {
        const current = document.activeElement;
        if (el.contains(current)) {
          if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
          else if (typeof document.body.focus === 'function') document.body.focus();
        }
      } catch {}
      // ARIA
      el.setAttribute('aria-hidden', 'true');
      el.removeAttribute('aria-modal');
      // Visual
      el.classList.remove('show');
      el.style.display = 'none';
      try { document.body.classList.remove('modal-open'); } catch {}
      // Backdrop
      try { if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); backdrop = null; } catch {}
      // Restore background interactivity
      setBackgroundInert(false);
      // Cleanup key handler
      try { if (keyHandler) document.removeEventListener('keydown', keyHandler, true); } catch {}
    }
  };
  return api;
}

async function requireAdmin() {
  // Prefer Store if available, fall back to localStorage
  const token = (window.App?.Store?.get()?.token) || getToken();
  const user = (window.App?.Store?.get()?.user) || getUser();
  if (!token || !user) { window.location.href = "index.html"; return; }
  try {
    if (window.App?.API) {
      await App.API.get('/validate-token', { ttl: 5000, skipCache: true });
    } else {
      const resp = await fetch(`${API_URL}/validate-token`, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) throw new Error('invalid token');
    }
    if (String(user.role).toLowerCase() !== "saas admin") { window.location.href = "dashboard.html"; }
  } catch (e) {
    try { window.App?.Store?.set?.({ token: '', user: null }); } catch {}
    localStorage.removeItem("token"); localStorage.removeItem("user"); window.location.href = "index.html";
  }
}

// Sidebar navigation
function setActiveSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
  document.querySelectorAll('#sidebarNav .nav-link').forEach(a => a.classList.toggle('active', a.getAttribute('data-target') === id));
  try { localStorage.setItem('admin_active_section', id); } catch {}
  const title = {
    'section-dashboard': 'Dashboard',
    'section-create-tenant': 'Create Tenant',
    'section-businesses': 'Businesses',
    'section-subs-all': 'All Subscriptions',
    'section-plans': 'Plans & Pricing',
    'section-plan-editor': 'Plan Editor',
    'section-my-subscription': 'My Subscription',
    'section-invoices': 'Invoices & Payments',
    'section-features': 'Business Feature Overrides',
    'section-renewal': 'Renewal Status',
    'section-payment-methods': 'Payment Methods',
    // Stock & Sales
    'section-stock': 'Stock & Sales',
    // Accounting
    'section-accounting-core': 'Accounting',
    'section-accounting-bank-accounts': 'Bank Accounts',
    'section-accounting-cash-accounts': 'Cash Accounts',
    'section-accounting-mobile-accounts': 'Mobile Money Accounts',
    'section-accounting-transactions': 'Transaction Accounts',
    'section-accounting-payables': 'Payables',
    'section-accounting-receivables': 'Receivables',
    'section-accounting-staff-tillsheets': 'Staff Till Sheets',
    // Reports
    'section-reports-balance-sheet': 'Balance Sheet',
    'section-reports-trial-balance': 'Trial Balance',
    'section-reports-cash-flow': 'Cash Flow',
    'section-reports-sales': 'Sales Reports',
    'section-reports-financial': 'Financial Reports',
    'section-reports-expenses': 'Expense Reports',
    // Roles & Permissions
    'section-roles-roles': 'Roles',
    'section-roles-permissions': 'Permissions Matrix',
    'section-roles-audit': 'Audit Logs',
    // System Settings
    'section-settings-shop': 'Shop Settings',
    'section-settings-fiscal': 'Fiscal Year Settings',
    'section-settings-currencies': 'Currencies'
  };
  const i18 = (window.App && App.I18n) ? App.I18n : null;
  const resolvedTitle = i18 ? (i18.t('nav', id) || title[id] || 'SaaS Admin') : (title[id] || 'SaaS Admin');
  document.getElementById('pageTitle').textContent = resolvedTitle;
  if (id === 'section-stock') { if (window.App?.Admin?.Stock?.setupUI) App.Admin.Stock.setupUI(); }
  if (id === 'section-dashboard') { if (window.App?.Admin?.Dashboard?.load) App.Admin.Dashboard.load(); }
  if (id === 'section-businesses') { if (window.App?.Admin?.Businesses?.setupUI) App.Admin.Businesses.setupUI(); if (window.App?.Admin?.Businesses?.loadList) App.Admin.Businesses.loadList(); }
  if (id === 'section-subs-all') { if (window.App?.Admin?.Subscriptions?.setupUI) App.Admin.Subscriptions.setupUI(); if (window.App?.Admin?.Subscriptions?.loadAll) App.Admin.Subscriptions.loadAll(); }
  if (id === 'section-users') { if (window.App?.Admin?.Users?.setupUI) App.Admin.Users.setupUI(); if (window.App?.Admin?.Users?.loadList) App.Admin.Users.loadList(); }
  if (id === 'section-plans') {
    // Prefer modular scripts
    if (window.App?.Admin?.Plans?.setupUI) App.Admin.Plans.setupUI();
    if (window.App?.Admin?.Plans?.loadTable) App.Admin.Plans.loadTable();
  }
  if (id === 'section-my-subscription') loadMySubscription();
  if (id === 'section-create-tenant') { if (window.App?.Admin?.Businesses?.setupUI) App.Admin.Businesses.setupUI(); }
  if (id === 'section-invoices') { if (window.App?.Admin?.Billing?.loadInvoices) App.Admin.Billing.loadInvoices(); }
  if (id === 'section-renewal') { if (window.App?.Admin?.Billing?.loadRenewal) App.Admin.Billing.loadRenewal(); }
  if (id === 'section-payment-methods') { if (window.App?.Admin?.Billing?.loadPaymentMethods) App.Admin.Billing.loadPaymentMethods(); }
  if (id === 'section-settings-shop' || id === 'section-settings-fiscal') { if (window.App?.Admin?.Settings?.setupUI) App.Admin.Settings.setupUI(); }
  if (id === 'section-features') {
    if (window.App?.Admin?.Features?.setupUI) App.Admin.Features.setupUI();
    // Seed the catalog into Features table (idempotent), then render catalog list
    (async ()=>{
      try { if (window.App?.Admin?.Features?.ensureCatalogSeed) await App.Admin.Features.ensureCatalogSeed(); } catch(e){ console.warn('Catalog seed failed:', e); }
      try { if (window.App?.Admin?.Features?.renderCatalog) App.Admin.Features.renderCatalog(); } catch(e){ console.warn('Catalog render failed:', e); }
    })();
  }
  // Lazy init Accounting UI when any accounting section is visited
  if (id && id.indexOf('section-accounting-') === 0) {
    if (window.App?.Admin?.Accounting?.setupUI) App.Admin.Accounting.setupUI();
  }
  // Toggle FAB visibility
  const fab = document.getElementById('fabCreate');
  if (fab) fab.classList.toggle('d-none', id !== 'section-businesses');
}

// moved to App.Admin.Businesses: setStep/collectData

// moved to App.Admin.Businesses: renderSummary

// moved to App.Admin.Businesses: submit

// moved to App.Admin.Businesses: loadList

// moved to App.Admin.Subscriptions (plan selection handled in module)

async function loadMySubscription(){
  try {
    const data = await (window.App?.API ? App.API.get('/admin/subscription', { ttl: 15000 }) : (async ()=>{
      const resp = await fetch(`${API_URL}/admin/subscription`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const j = await resp.json(); if (!resp.ok) throw new Error(j.error||'Failed to load subscription'); return j;
    })());
    const plan = document.getElementById('subPlan'); if (plan) plan.textContent = (data.plan||'—').toString();
    const cyc = document.getElementById('subCycle'); if (cyc) cyc.textContent = (data.cycle||'—').toString();
    const ren = document.getElementById('subRenew'); if (ren) ren.textContent = data.renews_on ? new Date(data.renews_on).toLocaleDateString() : '—';
  } catch(e){ showAlert(e.message, 'danger'); }
}

// moved to App.Admin.Billing: loadInvoices, loadRenewal, loadPaymentMethods

function setupNav() {
  const sidebar = document.getElementById('sidebarNav');
  sidebar.addEventListener('click', (e) => {
    const toggle = e.target.closest('.nav-group-toggle');
    if (toggle) {
      e.preventDefault();
      const groupId = toggle.getAttribute('data-group');
      const group = document.getElementById(groupId);
      if (!group) return;

      const wasHidden = group.classList.contains('d-none');
      // Close all groups first
      document.querySelectorAll('#sidebarNav .nav-sub').forEach(sub => sub.classList.add('d-none'));
      document.querySelectorAll('#sidebarNav .nav-group-toggle').forEach(t => t.classList.remove('open'));
      // Open only the clicked one if it was hidden
      if (wasHidden) {
        group.classList.remove('d-none');
        toggle.classList.add('open');
      }
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

  // Create button to open Create Tenant wizard
  const createBtn = document.getElementById('createBusinessBtn');
  if (createBtn) createBtn.addEventListener('click', () => {
    setActiveSection('section-create-tenant');
    try { window.App?.Admin?.Businesses?.setupUI?.(); } catch {}
    const form = document.getElementById('tenantForm'); if (form) form.reset();
  });

  // FAB Create
  const fab = document.getElementById('fabCreate');
  if (fab) fab.addEventListener('click', () => {
    setActiveSection('section-create-tenant');
    try { window.App?.Admin?.Businesses?.setupUI?.(); } catch {}
    const form = document.getElementById('tenantForm'); if (form) form.reset();
  });
}

// moved to App.Admin.Businesses: setupWizard and bindings

// ---- Dashboard Metrics ----
let revenueChart, plansChart;
function formatCurrency(n) {
  try {
    if (window.App?.I18n?.formatCurrency) return App.I18n.formatCurrency(n);
  } catch {}
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n||0));
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
  // ...
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
    const data = await (window.App?.API ? App.API.get('/admin/metrics', { ttl: 15000 }) : (async ()=>{
      const resp = await fetch(`${API_URL}/admin/metrics`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const j = await resp.json(); if (!resp.ok) throw new Error(j.error || 'Failed to load metrics'); return j;
    })());
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
    if (active === 'section-businesses') {
      if (window.App?.Admin?.Businesses?.loadList) App.Admin.Businesses.loadList();
    }
    if (active === 'section-dashboard') {
      if (window.App?.Admin?.Dashboard?.load) App.Admin.Dashboard.load();
    }
  });
  const reloadRecent = document.getElementById('reloadRecent');
  if (reloadRecent) reloadRecent.addEventListener('click', () => {
    if (window.App?.Admin?.Dashboard?.load) App.Admin.Dashboard.load();
  });

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

  // Invoices emailing and Features save handled inside respective module UIs

  // Wire My Subscription buttons
const upBtn = document.getElementById('upgradePlan');
if (upBtn) upBtn.addEventListener('click', async ()=> {
  try {
    const dj = await (window.App?.API ? App.API.post('/admin/subscription/upgrade', { body: { plan: 'pro' } }) : (async ()=>{
      const r = await fetch(`${API_URL}/admin/subscription/upgrade`, { method:'POST', headers: { 'Content-Type':'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ plan: 'pro' }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Upgrade failed'); return j; })());
    showToast(dj.message || 'Upgraded');
    try { window.App?.API?.invalidate?.('/admin/subscription'); } catch {}
    loadMySubscription();
  } catch(e){ showAlert(e.message, 'danger'); }
});

const downBtn = document.getElementById('downgradePlan');
if (downBtn) downBtn.addEventListener('click', async ()=> {
  try {
    const dj = await (window.App?.API ? App.API.post('/admin/subscription/downgrade', { body: { plan: 'starter' } }) : (async ()=>{
      const r = await fetch(`${API_URL}/admin/subscription/downgrade`, { method:'POST', headers: { 'Content-Type':'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ plan: 'starter' }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Downgrade failed'); return j; })());
    showToast(dj.message || 'Downgraded');
    try { window.App?.API?.invalidate?.('/admin/subscription'); } catch {}
    loadMySubscription();
  } catch(e){ showAlert(e.message, 'danger'); }
});

const editBtn = document.getElementById('editPlan');
if (editBtn) editBtn.addEventListener('click', async ()=> {
  try {
    // demo toggle cycle
    const curr = document.getElementById('subCycle')?.textContent?.trim().toLowerCase();
    const nextCycle = curr === 'annual' ? 'monthly' : 'annual';
    const dj = await (window.App?.API ? App.API.post('/admin/subscription/edit', { body: { billing_cycle: nextCycle } }) : (async ()=>{
      const r = await fetch(`${API_URL}/admin/subscription/edit`, { method:'POST', headers: { 'Content-Type':'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ billing_cycle: nextCycle }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Edit failed'); return j; })());
    showToast(`Billing cycle set to ${nextCycle}`);
    try { window.App?.API?.invalidate?.('/admin/subscription'); } catch {}
    loadMySubscription();
  } catch(e){ showAlert(e.message, 'danger'); }
});
  const token = getToken();
  const user = localStorage.getItem('user');
  if (!token || !user) {
    window.location.href = 'index.html';
    return;
  }
}

// [removed] legacy setActiveSection (modular routing handles navigation below)

function setActiveStep(step) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.step-pane').forEach(p => p.classList.add('d-none'));

  const activeStep = document.querySelector(`[data-step="${step}"]`);
  const activePane = document.querySelector(`[data-step-pane="${step}"]`);

  if (activeStep) activeStep.classList.add('active');
  if (activePane) activePane.classList.remove('d-none');
}

function renderReview() {
  const review = document.getElementById('pf_review');
  if (!review) return;

  const data = {
    business: document.getElementById('pf_bizName')?.value || '',
    tier: document.getElementById('pf_bizTier')?.value || '',
    owner: {
      fname: document.getElementById('pf_ownerFname')?.value || '',
      mname: document.getElementById('pf_ownerMname')?.value || '',
      lname: document.getElementById('pf_ownerLname')?.value || '',
      email: document.getElementById('pf_ownerEmail')?.value || '',
      bizName: document.getElementById('pf_ownerBizName')?.value || ''
    }
  };

  review.innerHTML = `
    <div class="row">
      <div class="col-md-6"><strong>Business:</strong> ${data.business}</div>
      <div class="col-md-6"><strong>Tier:</strong> ${data.tier}</div>
    </div>
    <div class="row mt-2">
      <div class="col-12"><strong>Owner:</strong> ${data.owner.fname} ${data.owner.mname} ${data.owner.lname}</div>
      <div class="col-12"><strong>Email:</strong> ${data.owner.email}</div>
    </div>
  `;
}

async function submitProvision(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const orig = btn?.textContent;
  if (btn) { btn.textContent = 'Provisioning...'; btn.disabled = true; }

  try {
    const bizPayload = {
      name: document.getElementById('pf_bizName')?.value?.trim(),
      subscription_tier: document.getElementById('pf_bizTier')?.value,
      owner: {
        fname: document.getElementById('pf_ownerFname')?.value?.trim(),
        mname: document.getElementById('pf_ownerMname')?.value?.trim(),
        lname: document.getElementById('pf_ownerLname')?.value?.trim(),
        email: document.getElementById('pf_ownerEmail')?.value?.trim(),
        business_name: document.getElementById('pf_ownerBizName')?.value?.trim()
      }
    };

    if (!bizPayload.name || !bizPayload.owner.email) {
      throw new Error('Business name and owner email are required');
    }

    const bRes = await fetch(`${API_URL}/admin/businesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(bizPayload)
    });
    const bJson = await bRes.json();
    if (!bRes.ok) throw new Error(bJson.error || 'Failed to create business');

    showToast('Tenant created successfully');
    setActiveSection('section-businesses');
  } catch (err) {
    showAlert(err.message, 'danger');
  } finally { if (btn) { btn.textContent = orig; btn.disabled = false; } }
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
      return `<tr><td>${b.name||'—'}</td><td>${b.subscription_tier||'—'}</td><td>${active}</td><td>${created}</td></tr>`;
    }).join('');
  } catch (err) {
    showAlert(err.message, 'danger');
    tbody.innerHTML = `<tr><td colspan="4" class="text-danger">${err.message}</td></tr>`;
  }
}

// ---- SaaS Admin: All Subscriptions ----
// moved to App.Admin.Subscriptions (readFilters, loadAll, bindings)

// ---- SaaS Admin: New Subscription (Manual Add) ----
// moved to App.Admin.Subscriptions (createNew + UI bindings)

// ===== Advanced Features Manager (matrix) =====
// Lightweight modal helper (no Bootstrap dependency required)

// moved to App.Admin.Features: setupUI, loadMatrix, saveMatrix

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Admin dashboard initializing...');
  try {
    // Check authentication first
    await requireAdmin();
    
    // Sync auth into Store and initialize ACL (RBAC/ABAC)
    try {
      if (window.App && App.Store) {
        App.Store.set({ user: getUser(), token: getToken() });
      }
      if (window.App && App.ACL) {
        const ability = App.ACL.defineAbility(App.Store?.get()?.user, App.Store?.get()?.features || []);
        App.ability = ability;
        App.ACL.applyDomPermissions(ability, document);
      }
    } catch (aclErr) {
      console.warn('ACL/Store init failed:', aclErr);
    }
    
    // Set up navigation
    setupNav();
    setupToolbar();
    // Prefer modular setup
    try { window.App?.Admin?.Plans?.setupUI?.(); } catch {}
    try { window.App?.Admin?.Features?.setupUI?.(); } catch {}
    try { window.App?.Admin?.Businesses?.setupUI?.(); } catch {}
    try { window.App?.Admin?.Subscriptions?.setupUI?.(); } catch {}
    
    // Load initial data via modules
    if (window.App?.Admin?.Dashboard?.load) await App.Admin.Dashboard.load();
    if (window.App?.Admin?.Businesses?.loadList) await App.Admin.Businesses.loadList();
    if (window.App?.Admin?.Plans?.loadTable) await App.Admin.Plans.loadTable();
    if (window.App?.Admin?.Features?.loadTable) await App.Admin.Features.loadTable();
    if (window.App?.Admin?.Subscriptions?.loadAll) await App.Admin.Subscriptions.loadAll();
    // Ensure Plan modal bindings are available even before visiting the section
    try { if (window.App?.Admin?.Plans?.setupUI) App.Admin.Plans.setupUI(); } catch {}

    // Restore last active section; default to dashboard if none
    const last = (()=>{ try { return localStorage.getItem('admin_active_section'); } catch { return null; } })();
    const initial = (last && document.getElementById(last)) ? last : 'section-dashboard';
    setActiveSection(initial);
    
    console.log('Admin dashboard initialized successfully');
  } catch (error) {
    console.error('Error initializing admin dashboard:', error);
    showAlert('Failed to initialize admin dashboard. Please check console for details.', 'danger');
  }
});