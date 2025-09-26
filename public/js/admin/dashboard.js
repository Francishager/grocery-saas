(function(){
  const root = window.App || (window.App = {});
  const Admin = root.Admin || (root.Admin = {});

  function formatCurrencyLocal(n){
    try { return typeof formatCurrency==='function' ? formatCurrency(n) : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n); } catch { return n; }
  }

  function renderKPIs(cards) {
    const c = cards || {};
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('kpiTotalBiz', c.totalBusinesses ?? '—');
    set('kpiRegistered', c.totalRegistered ?? '—');
    set('kpiActiveSubs', c.activeSubscriptions ?? '—');
    set('kpiMonthlyRevenue', formatCurrencyLocal(c.monthlyRevenue ?? 0));
  }

  function renderCharts(charts) {
    const colors = (window.App && App.colors) ? App.colors : { primary: '#0d6efd', series: ['#0d6efd', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a78bfa', '#14b8a6'] };
    const revEl = document.getElementById('chartRevenue');
    const planEl = document.getElementById('chartPlans');
    if (!revEl || !planEl || typeof Chart === 'undefined') return;
    // Destroy existing chart instances if present
    try { if (root.charts?.revenueChart) { root.charts.revenueChart.destroy(); root.charts.revenueChart = null; } } catch {}
    try { if (root.charts?.plansChart) { root.charts.plansChart.destroy(); root.charts.plansChart = null; } } catch {}
    const rev = charts?.revenue || { labels: [], data: [] };
    const pln = charts?.plans || { labels: [], data: [] };
    const revenueChart = new Chart(revEl.getContext('2d'), {
      type: 'line',
      data: { labels: rev.labels, datasets: [{ label: 'Revenue', data: rev.data, borderColor: colors.primary, backgroundColor: colors.primary + '33', tension: .25, fill: true }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: (v) => formatCurrencyLocal(v) } } } }
    });
    const plansChart = new Chart(planEl.getContext('2d'), {
      type: 'doughnut',
      data: { labels: pln.labels, datasets: [{ data: pln.data, backgroundColor: colors.series.slice(0, pln.labels.length) }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
    // Store refs if needed later
    root.charts = { revenueChart, plansChart };
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

  async function load(){
    try {
      const data = await (root.API ? root.API.get('/admin/metrics', { ttl: 15000 }) : (async ()=>{
        const resp = await fetch(`${root.API_URL||window.location.origin}/admin/metrics`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        const j = await resp.json(); if (!resp.ok) throw new Error(j.error || 'Failed to load metrics'); return j; })());
      renderKPIs(data.cards);
      renderCharts(data.charts);
      renderRecent(data.recent);
      const churn = document.getElementById('kpiChurn'); if (churn) churn.textContent = ((data.churnRate ?? 0) + '%');
      const up = document.getElementById('kpiUptime'); if (up) up.textContent = (data.uptimeHours ?? 0).toString();

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
    } catch (e) { showAlert(e.message, 'danger'); }
  }

  Admin.Dashboard = { load, renderKPIs, renderCharts, renderRecent };
})();
