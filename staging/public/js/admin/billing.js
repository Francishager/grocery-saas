(function(){
  const root = window.App || (window.App = {});
  const Admin = root.Admin || (root.Admin = {});

  function formatCurrencyLocal(n){
    try { return typeof formatCurrency==='function' ? formatCurrency(n) : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n); } catch { return n; }
  }

  async function loadInvoices(){
    try {
      const data = await (root.API ? root.API.get('/admin/invoices', { ttl: 30000 }) : (async ()=>{
        const resp = await fetch(`${root.API_URL||window.location.origin}/admin/invoices`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        const j = await resp.json(); if (!resp.ok) throw new Error(j.error||'Failed to load invoices'); return j; })());
      const tbody = document.getElementById('invoiceTable');
      if (tbody) tbody.innerHTML = (data||[]).map(inv=>{
        const date = inv.date ? new Date(inv.date).toLocaleDateString() : '—';
        const amt = formatCurrencyLocal(inv.amount||0);
        const st = inv.status || '—';
        return `<tr><td>${inv.id}</td><td>${date}</td><td>${amt}</td><td>${st}</td><td><button class="btn btn-sm btn-outline-secondary" data-email-invoice="${inv.id}" data-can="manage:all">Email</button></td></tr>`;
      }).join('');
      document.querySelectorAll('[data-email-invoice]').forEach(btn=>btn.addEventListener('click', async (e)=>{
        const id = e.currentTarget.getAttribute('data-email-invoice');
        try {
          if (root.API) await root.API.post(`/admin/invoices/${id}/email`);
          else {
            const r = await fetch(`${root.API_URL||window.location.origin}/admin/invoices/${id}/email`, { method:'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
            const dj = await r.json(); if (!r.ok) throw new Error(dj.error||'Failed to email invoice');
          }
          showToast('Invoice sent');
        } catch(err){ showAlert(err.message, 'danger'); }
      }));
      if (root.ACL && root.ability && tbody) root.ACL.applyDomPermissions(root.ability, tbody);
    } catch(e){ showAlert(e.message, 'danger'); }
  }

  async function loadRenewal(){
    try {
      const data = await (root.API ? root.API.get('/admin/renewal-status', { ttl: 15000 }) : (async ()=>{
        const resp = await fetch(`${root.API_URL||window.location.origin}/admin/renewal-status`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        const j = await resp.json(); if (!resp.ok) throw new Error(j.error||'Failed to load renewal status'); return j; })());
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
      const data = await (root.API ? root.API.get('/admin/payment-methods', { ttl: 86400000 }) : (async ()=>{
        const resp = await fetch(`${root.API_URL||window.location.origin}/admin/payment-methods`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        const j = await resp.json(); if (!resp.ok) throw new Error(j.error||'Failed to load payment methods'); return j; })());
      const list = document.getElementById('paymentMethodsList');
      if (list) list.innerHTML = (data||[]).map(pm=>{
        const desc = pm.id === 'cash' ? 'Record cash payments' : (pm.id === 'mobile_money' ? 'MTN, Airtel etc.' : 'Secure card payments');
        return `<div class="col-md-4"><div class="card h-100"><div class="card-body"><h6>${pm.name}</h6><p class="small text-muted mb-2">${desc}</p><button class="btn btn-outline-secondary btn-sm" data-use-payment="${pm.id}">Use</button></div></div></div>`;
      }).join('');
      if (root.ACL && root.ability) root.ACL.applyDomPermissions(root.ability, list);
    } catch(e){ showAlert(e.message, 'danger'); }
  }

  Admin.Billing = { loadInvoices, loadRenewal, loadPaymentMethods };
})();
