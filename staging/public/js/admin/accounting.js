(function(){
  const root = window.App || (window.App = {});
  const Admin = root.Admin || (root.Admin = {});
  const API_BASE = root.API_URL || window.location.origin;

  function authHeaders(){
    const t = (root.Store?.get?.()?.token) || localStorage.getItem('token');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` };
  }
  async function apiGet(path){
    if (root.API) return root.API.get(path, { ttl: 15000 });
    const r = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || `GET ${path} failed`); return j;
  }
  async function apiPost(path, body){
    if (root.API) return root.API.post(path, { body });
    const r = await fetch(`${API_BASE}${path}`, { method:'POST', headers: authHeaders(), body: JSON.stringify(body) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || `POST ${path} failed`); return j;
  }
  async function apiPatch(path, body){
    if (root.API?.patch) return root.API.patch(path, { body });
    const r = await fetch(`${API_BASE}${path}`, { method:'PATCH', headers: authHeaders(), body: JSON.stringify(body) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || `PATCH ${path} failed`); return j;
  }
  async function apiPut(path, body){
    if (root.API?.put) return root.API.put(path, { body });
    const r = await fetch(`${API_BASE}${path}`, { method:'PUT', headers: authHeaders(), body: JSON.stringify(body) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || `PUT ${path} failed`); return j;
  }

  // Small helpers
  const $ = (id)=> document.getElementById(id);
  const el = (t, c)=>{ const e = document.createElement(t); if (c) e.className = c; return e; };
  const Table = (root.UI && root.UI.Table) ? root.UI.Table : null;
  function safeMsg(e){
    const m = (e && (e.message || e.toString())) || 'Error';
    if (/unknown table/i.test(m)) return 'Not configured yet. Please configure this table in Grist or contact an admin.';
    return m;
  }
  let COA_CACHE = null;
  let CAT_EDIT_ID = null;
  let ADD_MODAL_PRESELECT = null;
  let ADD_MODAL_PREF_BRANCH = null;

  // Hardcoded Chart of Accounts (defaults)
  const COA_DEFAULTS = [
    { type:'Asset', name:'Cash on Hand', code:'1000' },
    { type:'Asset', name:'Cash at Bank', code:'1001' },
    { type:'Asset', name:'Accounts Receivable', code:'1002' },
    { type:'Asset', name:'Inventory / Stock', code:'1003' },
    { type:'Asset', name:'Prepaid Expenses', code:'1004' },
    { type:'Asset', name:'Equipment', code:'1005' },
    { type:'Asset', name:'Furniture & Fixtures', code:'1006' },
    { type:'Asset', name:'Vehicles', code:'1007' },
    { type:'Asset', name:'Accumulated Depreciation', code:'1008' },
    { type:'Liability', name:'Accounts Payable (suppliers)', code:'2000' },
    { type:'Liability', name:'Short-Term Loans / Bank Overdrafts', code:'2001' },
    { type:'Liability', name:'Accrued Expenses', code:'2002' },
    { type:'Liability', name:'Taxes Payable', code:'2003' },
    { type:'Liability', name:'Long-Term Loans / Mortgages', code:'2004' },
    { type:'Equity', name:'Owner’s Capital', code:'3000' },
    { type:'Equity', name:'Retained Earnings', code:'3001' },
    { type:'Equity', name:'Drawings / Owner Withdrawals', code:'3002' },
    { type:'Equity', name:'Share Capital', code:'3003' },
    { type:'Income', name:'Sales Revenue', code:'4000' },
    { type:'Income', name:'Service Revenue', code:'4001' },
    { type:'Income', name:'Other Income', code:'4002' },
    { type:'Expenses', name:'Rent / Office / Store Lease', code:'5000' },
    { type:'Expenses', name:'Utilities', code:'5001' },
    { type:'Expenses', name:'Salaries & Wages', code:'5002' },
    { type:'Expenses', name:'Employee Benefits', code:'5003' },
    { type:'Expenses', name:'Advertising & Marketing', code:'5004' },
    { type:'Expenses', name:'Insurance', code:'5005' },
    { type:'Expenses', name:'Repairs & Maintenance', code:'5006' },
    { type:'Expenses', name:'Office Supplies', code:'5007' },
    { type:'Expenses', name:'Purchase of Inventory', code:'5008' },
    { type:'Expenses', name:'Freight / Shipping for inventory', code:'5009' },
    { type:'Expenses', name:'Bank Charges', code:'5010' },
    { type:'Expenses', name:'Depreciation', code:'5011' },
    { type:'Expenses', name:'Taxes', code:'5012' }
  ];

  function keyFor(it){ return `${normType(it.type)}:${it.name}`; }
  function getCodeOverrides(){
    try{ return JSON.parse(localStorage.getItem('coa_code_overrides')||'{}'); }
    catch{ return {}; }
  }
  function saveCodeOverrides(m){ localStorage.setItem('coa_code_overrides', JSON.stringify(m||{})); }
  function getBalances(){
    try{ return JSON.parse(localStorage.getItem('coa_balances')||'{}'); }
    catch{ return {}; }
  }
  function saveBalances(m){ localStorage.setItem('coa_balances', JSON.stringify(m||{})); }
  function getBranchLedger(){
    try{ return JSON.parse(localStorage.getItem('coa_balances_by_branch')||'{}'); }
    catch{ return {}; }
  }
  function saveBranchLedger(m){ localStorage.setItem('coa_balances_by_branch', JSON.stringify(m||{})); }
  function getSubNames(){
    try{ return JSON.parse(localStorage.getItem('coa_sub_names')||'{}'); }
    catch{ return {}; }
  }
  function saveSubNames(m){ localStorage.setItem('coa_sub_names', JSON.stringify(m||{})); }
  function getSubMeta(){
    try{ return JSON.parse(localStorage.getItem('coa_sub_meta')||'{}'); }
    catch{ return {}; }
  }
  function saveSubMeta(m){ localStorage.setItem('coa_sub_meta', JSON.stringify(m||{})); }
  function getCoaList(){
    const ov = getCodeOverrides();
    return COA_DEFAULTS.map(it => ({ type: normType(it.type), name: it.name, code: ov[keyFor(it)] || it.code }));
  }
  function getItemByKey(k){ return getCoaList().find(it => keyFor(it)===k); }
  function migrateBalance(oldCode, newCode){
    if (!oldCode || !newCode || oldCode===newCode) return;
    const bal = getBalances(); const v = Number(bal[oldCode]||0);
    if (v){ bal[newCode] = Number(bal[newCode]||0) + v; delete bal[oldCode]; saveBalances(bal); }
  }
  function setCategoryCodeLocal(itemKey, newCode){
    const ov = getCodeOverrides();
    const it = COA_DEFAULTS.find(d => keyFor(d)===itemKey);
    const old = (ov[itemKey] || it?.code);
    ov[itemKey] = newCode; saveCodeOverrides(ov); migrateBalance(old, newCode);
  }
  function openAddModal(preKey, preBranch){ ADD_MODAL_PRESELECT = preKey || null; ADD_MODAL_PREF_BRANCH = preBranch || null; ensureCoaModal(); const m = document.getElementById('coaModal'); if (m && window.bootstrap?.Modal){ const inst = new bootstrap.Modal(m); prepCoaModal(); inst.show(); } }
  function renderTableInto(box, headers, rows){
    const wrap = el('div', 'table-wrap');
    const table = el('table', 'table table-sm align-middle');
    const thead = el('thead'); const trh = el('tr');
    headers.forEach(h=>{ const th = el('th'); th.textContent = h; trh.appendChild(th); });
    thead.appendChild(trh); const tbody = el('tbody');
    if (!rows || rows.length === 0){
      const tr = el('tr'); const td = el('td'); td.colSpan = headers.length;
      td.className = 'text-muted'; td.textContent = 'No data'; tr.appendChild(td); tbody.appendChild(tr);
    } else {
      rows.forEach(r=>{ const tr = el('tr');
        headers.forEach(h=>{ const td = el('td'); td.textContent = r[h] ?? r[h.toLowerCase()] ?? '—'; tr.appendChild(td); });
        tbody.appendChild(tr);
      });
    }
    table.appendChild(thead); table.appendChild(tbody); wrap.appendChild(table);
    box.innerHTML = ''; box.appendChild(wrap);
  }

  // Transaction Accounts (tabs exist in HTML)
  function initTransactionAccounts(){
    const sec = $('section-accounting-transactions'); if (!sec) return;
    // Lazy-init placeholder tables once
    const bank = $('tab-bank'); const cash = $('tab-cash'); const mob = $('tab-mobile');
    if (bank && !bank.dataset.init){ bank.dataset.init = '1';
      renderTableInto(bank, ['Account','Number','Branch','Balance'], []);
    }
    if (cash && !cash.dataset.init){ cash.dataset.init = '1';
      renderTableInto(cash, ['Till Name','Location','Balance'], []);
    }
    if (mob && !mob.dataset.init){ mob.dataset.init = '1';
      renderTableInto(mob, ['Wallet','Provider','Number','Balance'], []);
    }
  }

  // Accounting core tabs
  function initAccountingCore(){
    const sec = $('section-accounting-core'); if (!sec) return;
    // Chart of Accounts (header + right-aligned Add button, modal form)
    const coa = $('tab-coa'); if (coa && !coa.dataset.init){
      coa.dataset.init = '1';
      const header = el('div', 'd-flex justify-content-between align-items-center mb-2');
      const title = el('h6', 'mb-0'); title.textContent = 'Chart of Accounts';
      const addBtn = el('button', 'btn btn-primary btn-sm'); addBtn.id = 'coa_add_btn'; addBtn.textContent = 'Create SubAccount';
      header.appendChild(title); header.appendChild(addBtn);
      const box = el('div'); box.id = 'coa_table_box';
      coa.innerHTML = ''; coa.appendChild(header); coa.appendChild(box);
      addBtn.addEventListener('click', () => openAddModal(null));
      loadCoa();
    }

    // Register Journal Entries
    const ent = $('tab-entries'); if (ent && !ent.dataset.init){
      ent.dataset.init = '1';
      const form = el('form', 'row g-2 mb-3');
      form.innerHTML = [
        '<div class="col-md-3"><label class="form-label">Date</label><input id="je_date" type="date" class="form-control" required/></div>',
        '<div class="col-md-3"><label class="form-label">Ref #</label><input id="je_ref" class="form-control"/></div>',
        '<div class="col-md-6"><label class="form-label">Description</label><input id="je_desc" class="form-control"/></div>',
        '<div class="col-md-4"><label class="form-label">Account</label><input id="je_account" class="form-control" placeholder="e.g., 1000 - Cash" required/></div>',
        '<div class="col-md-4"><label class="form-label">Debit</label><input id="je_debit" type="number" step="0.01" class="form-control"/></div>',
        '<div class="col-md-4"><label class="form-label">Credit</label><input id="je_credit" type="number" step="0.01" class="form-control"/></div>',
        '<div class="col-12 d-flex justify-content-end"><button class="btn btn-primary btn-sm" type="submit">Post Entry</button></div>'
      ].join('');
      const box = el('div'); box.id = 'je_table_box';
      form.addEventListener('submit', async (e)=>{
        e.preventDefault();
        try{
          const payload = { date: $('je_date').value || null, ref_number: $('je_ref').value?.trim() || null, description: $('je_desc').value?.trim() || null, account: $('je_account').value?.trim(), debit: Number($('je_debit').value || 0), credit: Number($('je_credit').value || 0) };
          await apiPost('/admin/crud/Journal_Entries', payload);
          root.API?.invalidate?.('/admin/crud/Journal_Entries'); showToast('Journal entry posted');
          await loadJournalEntries(); e.target.reset();
        }catch(err){ showAlert(err.message, 'danger'); }
      });
      ent.innerHTML = ''; ent.appendChild(form); ent.appendChild(box); loadJournalEntries();
    }

    // Journal Ledgers (simple filter + list)
    const led = $('tab-ledgers'); if (led && !led.dataset.init){
      led.dataset.init = '1';
      const filt = el('div', 'row g-2 mb-2');
      filt.innerHTML = [
        '<div class="col-md-4"><label class="form-label">Account</label><input id="jl_account" class="form-control" placeholder="e.g., 1000 - Cash"/></div>',
        '<div class="col-md-3"><label class="form-label">From</label><input id="jl_from" type="date" class="form-control"/></div>',
        '<div class="col-md-3"><label class="form-label">To</label><input id="jl_to" type="date" class="form-control"/></div>',
        '<div class="col-md-2 d-flex align-items-end"><button id="jl_apply" class="btn btn-outline-secondary btn-sm w-100">Apply</button></div>'
      ].join('');
      const box = el('div'); box.id = 'jl_table_box';
      led.innerHTML = ''; led.appendChild(filt); led.appendChild(box);
      $('jl_apply').addEventListener('click', (e)=>{ e.preventDefault(); loadLedger(); });
      loadLedger();
    }

    // Account Categories UI
    const cat = $('tab-categories');
    if (cat && !cat.dataset.init){ cat.dataset.init = '1'; renderCategoriesUI(cat); }
    const tax = $('tab-tax'); if (tax && !tax.dataset.init){ tax.dataset.init = '1'; tax.innerHTML = '<div class="text-muted">Coming soon — Tax Management</div>'; }
  }

  async function loadCoa(){
    const box = $('coa_table_box'); if (!box) return;
    try{
      const rows = getCoaList();
      const cats = rows; // same items act as categories list
      renderCoaAccordion(box, rows, cats);
    }catch(e){ box.innerHTML = `<div class="text-muted">${safeMsg(e)}</div>`; }
  }

  // Category modal
  function ensureCatModal(){
    if (document.getElementById('catModal')) return;
    const d = document.createElement('div'); d.className='modal'; d.id='catModal'; d.tabIndex=-1;
    d.innerHTML = [
      '<div class="modal-dialog">',
      '<div class="modal-content">',
      '<div class="modal-header"><h6 class="modal-title">Add Account Category</h6>',
      '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>',
      '<div class="modal-body">',
      '<form id="catForm" class="row g-2">',
      '<div class="col-md-6"><label class="form-label">Type</label><select id="c_type" class="form-select"><option>Asset</option><option>Liability</option><option>Equity</option><option>Income</option><option>Expenses</option></select></div>',
      '<div class="col-md-6"><label class="form-label">Name</label><input id="c_name" class="form-control" required/></div>',
      '<div class="col-md-6"><label class="form-label">Code</label><input id="c_code" class="form-control" required/></div>',
      '</form>',
      '</div>',
      '<div class="modal-footer">',
      '<button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Close</button>',
      '<button type="button" class="btn btn-primary btn-sm" id="catSaveBtn">Save</button>',
      '</div></div></div>'
    ].join('');
    document.body.appendChild(d);
    document.getElementById('catSaveBtn').addEventListener('click', saveCategory);
    d.addEventListener('shown.bs.modal', prepCatModal);
  }
  async function prepCatModal(){
    try{
      const rows = await apiGet('/admin/crud/Account_Categories');
      const typeSel = document.getElementById('c_type');
      const codeEl = document.getElementById('c_code');
      function nextCode(){
        const t = typeSel.value; const same = (rows||[]).filter(r=> normType(r.type)===t);
        const nums = same.map(r=> parseInt(String(r.code||'').replace(/[^0-9]/g,''),10)).filter(n=>!isNaN(n));
        const base = baseForType(t); const max = nums.length? Math.max(...nums): (base-1); return String(max+1);
      }
      function recalc(){ if (codeEl) codeEl.value = nextCode(); }
      typeSel?.removeEventListener('_tmp', recalc); // noop guard
      typeSel?.addEventListener('change', recalc);
      recalc();
    }catch(e){ /* ignore */ }
  }
  async function saveCategory(){
    try{
      const payload = {
        type: document.getElementById('c_type').value,
        name: document.getElementById('c_name').value?.trim(),
        code: document.getElementById('c_code').value?.trim()
      };
      if (!payload.name || !payload.code){ showAlert('Name and Code required','danger'); return; }
      await apiPost('/admin/crud/Account_Categories', payload);
      showToast('Category created');
      const m = document.getElementById('catModal'); if (m && window.bootstrap?.Modal){ bootstrap.Modal.getInstance(m)?.hide(); }
      await loadCategories();
      await loadCoa();
    }catch(e){ showAlert(safeMsg(e),'danger'); }
  }
  async function loadJournalEntries(){
    const box = $('je_table_box'); if (!box) return;
    try{
      const rows = await apiGet('/admin/crud/Journal_Entries');
      const mapped = (rows || []).map(r=>({ Date: r.date || '', Ref: r.ref_number || '', Description: r.description || '', Account: r.account || '', Debit: r.debit || 0, Credit: r.credit || 0 }));
      if (Table){ Table.mount(box, { columns: ['Date','Ref','Description','Account','Debit','Credit'], rows: mapped }); }
      else { renderTableInto(box, ['Date','Ref','Description','Account','Debit','Credit'], mapped); }
    }catch(e){ box.innerHTML = `<div class="text-muted">${safeMsg(e)}</div>`; }
  }
  async function loadLedger(){
    const box = $('jl_table_box'); if (!box) return;
    try{
      const rows = await apiGet('/admin/crud/Journal_Ledger');
      const mapped = (rows || []).map(r=>({ Date: r.date || '', Ref: r.ref_number || '', Description: r.description || '', Debit: r.debit || 0, Credit: r.credit || 0, Balance: r.balance || 0 }));
      if (Table){ Table.mount(box, { columns: ['Date','Ref','Description','Debit','Credit','Balance'], rows: mapped }); }
      else { renderTableInto(box, ['Date','Ref','Description','Debit','Credit','Balance'], mapped); }
    }catch(e){ box.innerHTML = `<div class="text-muted">${safeMsg(e) || 'No ledger data'}</div>`; }
  }

  // Payables
  function initPayables(){
    const sec = $('section-accounting-payables'); if (!sec || sec.dataset.init) return; sec.dataset.init = '1';
    const card = el('div', 'card shadow-sm'); const body = el('div', 'card-body');
    const head = el('div', 'd-flex justify-content-between align-items-center mb-3');
    const title = el('h5'); title.textContent = 'Payables'; head.appendChild(title);
    const btns = el('div', 'd-flex gap-2');
    const addBtn = el('button', 'btn btn-success btn-sm'); addBtn.textContent = 'Add Payable';
    const viewBtn = el('button', 'btn btn-outline-secondary btn-sm'); viewBtn.textContent = 'View Creditors';
    btns.appendChild(addBtn); btns.appendChild(viewBtn); head.appendChild(btns);
    const form = el('form', 'row g-2 mb-3 d-none'); form.id = 'payables_form';
    form.innerHTML = [
      '<div class="col-md-3"><label class="form-label">Creditor name</label><input id="p_creditor" class="form-control" required/></div>',
      '<div class="col-md-3"><label class="form-label">Description</label><input id="p_desc" class="form-control"/></div>',
      '<div class="col-md-2"><label class="form-label">Ref number</label><input id="p_ref" class="form-control"/></div>',
      '<div class="col-md-2"><label class="form-label">Product</label><input id="p_product" class="form-control"/></div>',
      '<div class="col-md-2"><label class="form-label">Amount</label><input id="p_amount" type="number" step="0.01" class="form-control" required/></div>',
      '<div class="col-md-2"><label class="form-label">Amount paid</label><input id="p_amount_paid" type="number" step="0.01" class="form-control"/></div>',
      '<div class="col-md-2"><label class="form-label">Payment date</label><input id="p_payment_date" type="date" class="form-control"/></div>',
      '<div class="col-md-2"><label class="form-label">Maturity date</label><input id="p_maturity_date" type="date" class="form-control"/></div>',
      '<div class="col-md-3"><label class="form-label">Branch</label><input id="p_branch" class="form-control"/></div>',
      '<div class="col-12 d-flex justify-content-end"><button class="btn btn-primary btn-sm" type="submit">Save</button></div>'
    ].join('');
    const tableBox = el('div'); tableBox.id = 'payables_table_box';
    addBtn.addEventListener('click', ()=> form.classList.toggle('d-none'));
    viewBtn.addEventListener('click', ()=> showToast('Creditors list coming soon'));
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      try{
        const payload = {
          creditor_name: $('p_creditor').value?.trim(), description: $('p_desc').value?.trim() || null,
          ref_number: $('p_ref').value?.trim() || null, product: $('p_product').value?.trim() || null,
          amount: Number($('p_amount').value || 0), amount_paid: Number($('p_amount_paid').value || 0),
          payment_date: $('p_payment_date').value || null, maturity_date: $('p_maturity_date').value || null,
          branch: $('p_branch').value?.trim() || null
        };
        await apiPost('/admin/crud/Payables', payload);
        root.API?.invalidate?.('/admin/crud/Payables'); showToast('Payable saved');
        form.reset(); form.classList.add('d-none'); await loadPayables();
      }catch(err){ showAlert(err.message, 'danger'); }
    });
    body.appendChild(head); body.appendChild(form); body.appendChild(tableBox);
    card.appendChild(body); sec.innerHTML = ''; sec.appendChild(card);
    loadPayables();
  }
  async function loadPayables(){
    const box = $('payables_table_box'); if (!box) return;
    try{
      const rows = await apiGet('/admin/crud/Payables');
      const headers = ['Creditor name','Description','Ref number','Product','Amount','Amount paid','Payment date','Maturity date','Branch'];
      const mapped = (rows || []).map(r=>({
        'Creditor name': r.creditor_name || '—', 'Description': r.description || '—', 'Ref number': r.ref_number || '—',
        'Product': r.product || '—', 'Amount': r.amount ?? 0, 'Amount paid': r.amount_paid ?? 0,
        'Payment date': r.payment_date || '—', 'Maturity date': r.maturity_date || '—', 'Branch': r.branch || '—'
      }));
      if (Table){ Table.mount(box, { columns: headers, rows: mapped, rowActions: ['Edit','Delete'] }); }
      else { renderTableInto(box, headers, mapped); }
    }catch(e){ box.innerHTML = `<div class="text-muted">${safeMsg(e)}</div>`; }
  }

  // Receivables
  function initReceivables(){
    const sec = $('section-accounting-receivables'); if (!sec || sec.dataset.init) return; sec.dataset.init = '1';
    const card = el('div', 'card shadow-sm'); const body = el('div', 'card-body');
    const head = el('div', 'd-flex justify-content-between align-items-center mb-3');
    const title = el('h5'); title.textContent = 'Receivables'; head.appendChild(title);
    const btns = el('div', 'd-flex gap-2');
    const addBtn = el('button', 'btn btn-success btn-sm'); addBtn.textContent = 'Add Receivable';
    const viewBtn = el('button', 'btn btn-outline-secondary btn-sm'); viewBtn.textContent = 'View Debtors';
    btns.appendChild(addBtn); btns.appendChild(viewBtn); head.appendChild(btns);
    const form = el('form', 'row g-2 mb-3 d-none'); form.id = 'receivables_form';
    form.innerHTML = [
      '<div class="col-md-3"><label class="form-label">Debtor name</label><input id="r_debtor" class="form-control" required/></div>',
      '<div class="col-md-3"><label class="form-label">Description</label><input id="r_desc" class="form-control"/></div>',
      '<div class="col-md-2"><label class="form-label">Ref number</label><input id="r_ref" class="form-control"/></div>',
      '<div class="col-md-2"><label class="form-label">Product</label><input id="r_product" class="form-control"/></div>',
      '<div class="col-md-2"><label class="form-label">Amount</label><input id="r_amount" type="number" step="0.01" class="form-control" required/></div>',
      '<div class="col-md-2"><label class="form-label">Amount paid</label><input id="r_amount_paid" type="number" step="0.01" class="form-control"/></div>',
      '<div class="col-md-2"><label class="form-label">Payment date</label><input id="r_payment_date" type="date" class="form-control"/></div>',
      '<div class="col-md-2"><label class="form-label">Maturity date</label><input id="r_maturity_date" type="date" class="form-control"/></div>',
      '<div class="col-md-3"><label class="form-label">Branch</label><input id="r_branch" class="form-control"/></div>',
      '<div class="col-12 d-flex justify-content-end"><button class="btn btn-primary btn-sm" type="submit">Save</button></div>'
    ].join('');
    const tableBox = el('div'); tableBox.id = 'receivables_table_box';
    addBtn.addEventListener('click', ()=> form.classList.toggle('d-none'));
    viewBtn.addEventListener('click', ()=> showToast('Debtors list coming soon'));
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      try{
        const payload = {
          debtor_name: $('r_debtor').value?.trim(), description: $('r_desc').value?.trim() || null,
          ref_number: $('r_ref').value?.trim() || null, product: $('r_product').value?.trim() || null,
          amount: Number($('r_amount').value || 0), amount_paid: Number($('r_amount_paid').value || 0),
          payment_date: $('r_payment_date').value || null, maturity_date: $('r_maturity_date').value || null,
          branch: $('r_branch').value?.trim() || null
        };
        await apiPost('/admin/crud/Receivables', payload);
        root.API?.invalidate?.('/admin/crud/Receivables'); showToast('Receivable saved');
        form.reset(); form.classList.add('d-none'); await loadReceivables();
      }catch(err){ showAlert(err.message, 'danger'); }
    });
    body.appendChild(head); body.appendChild(form); body.appendChild(tableBox);
    card.appendChild(body); sec.innerHTML = ''; sec.appendChild(card);
    loadReceivables();
  }
  async function loadReceivables(){
    const box = $('receivables_table_box'); if (!box) return;
    try{
      const rows = await apiGet('/admin/crud/Receivables');
      const headers = ['Debtor name','Description','Ref number','Product','Amount','Amount paid','Payment date','Maturity date','Branch'];
      const mapped = (rows || []).map(r=>({
        'Debtor name': r.debtor_name || '—', 'Description': r.description || '—', 'Ref number': r.ref_number || '—',
        'Product': r.product || '—', 'Amount': r.amount ?? 0, 'Amount paid': r.amount_paid ?? 0,
        'Payment date': r.payment_date || '—', 'Maturity date': r.maturity_date || '—', 'Branch': r.branch || '—'
      }));
      if (Table){ Table.mount(box, { columns: headers, rows: mapped, rowActions: ['Edit','Delete'] }); }
      else { renderTableInto(box, headers, mapped); }
    }catch(e){ box.innerHTML = `<div class="text-muted">${safeMsg(e)}</div>`; }
  }

  // Staff Till Sheets
  function initTillSheets(){
    const sec = $('section-accounting-staff-tillsheets'); if (!sec || sec.dataset.init) return; sec.dataset.init = '1';
    const card = el('div', 'card shadow-sm'); const body = el('div', 'card-body');
    const head = el('div', 'd-flex justify-content-between align-items-center mb-3');
    const title = el('h5'); title.textContent = 'Staff Till Sheets'; head.appendChild(title);
    const addBtn = el('button', 'btn btn-success btn-sm'); addBtn.textContent = 'Add Record'; head.appendChild(addBtn);
    const form = el('form', 'row g-2 mb-3 d-none'); form.id = 'till_form';
    form.innerHTML = [
      '<div class="col-md-2"><label class="form-label">Date</label><input id="t_date" type="date" class="form-control" required/></div>',
      '<div class="col-md-3"><label class="form-label">Description</label><input id="t_desc" class="form-control"/></div>',
      '<div class="col-md-2"><label class="form-label">Buyer</label><input id="t_buyer" class="form-control"/></div>',
      '<div class="col-md-2"><label class="form-label">Attendant</label><input id="t_attendant" class="form-control"/></div>',
      '<div class="col-md-2"><label class="form-label">Good amount</label><input id="t_good" type="number" step="0.01" class="form-control"/></div>',
      '<div class="col-md-2"><label class="form-label">Category</label><input id="t_category" class="form-control"/></div>',
      '<div class="col-md-2"><label class="form-label">Product</label><input id="t_product" class="form-control"/></div>',
      '<div class="col-md-2"><label class="form-label">Sold amount</label><input id="t_sold" type="number" step="0.01" class="form-control"/></div>',
      '<div class="col-md-2"><label class="form-label">Balance</label><input id="t_balance" type="number" step="0.01" class="form-control"/></div>',
      '<div class="col-md-3"><label class="form-label">Sold datestamp</label><input id="t_sold_at" type="datetime-local" class="form-control"/></div>',
      '<div class="col-12 d-flex justify-content-end"><button class="btn btn-primary btn-sm" type="submit">Save</button></div>'
    ].join('');
    const tableBox = el('div'); tableBox.id = 'till_table_box';
    addBtn.addEventListener('click', ()=> form.classList.toggle('d-none'));
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      try{
        const payload = {
          date: $('t_date').value || null, description: $('t_desc').value?.trim() || null,
          buyer: $('t_buyer').value?.trim() || null, attendant: $('t_attendant').value?.trim() || null,
          good_amount: Number($('t_good').value || 0), category: $('t_category').value?.trim() || null,
          product: $('t_product').value?.trim() || null, sold_amount: Number($('t_sold').value || 0),
          balance: Number($('t_balance').value || 0), sold_datestamp: $('t_sold_at').value || null
        };
        await apiPost('/admin/crud/Staff_Till_Sheets', payload);
        root.API?.invalidate?.('/admin/crud/Staff_Till_Sheets'); showToast('Record saved');
        form.reset(); form.classList.add('d-none'); await loadTillSheets();
      }catch(err){ showAlert(err.message, 'danger'); }
    });
    body.appendChild(head); body.appendChild(form); body.appendChild(tableBox);
    card.appendChild(body); sec.innerHTML = ''; sec.appendChild(card);
    loadTillSheets();
  }
  async function loadTillSheets(){
    const box = $('till_table_box'); if (!box) return;
    try{
      const rows = await apiGet('/admin/crud/Staff_Till_Sheets');
      const headers = ['Date','Description','Buyer','Attendant','Good amount','Category','Product','Sold amount','Balance','Sold datestamp'];
      const mapped = (rows || []).map(r=>({
        'Date': r.date || '—', 'Description': r.description || '—', 'Buyer': r.buyer || '—',
        'Attendant': r.attendant || '—', 'Good amount': r.good_amount ?? 0, 'Category': r.category || '—',
        'Product': r.product || '—', 'Sold amount': r.sold_amount ?? 0, 'Balance': r.balance ?? 0,
        'Sold datestamp': r.sold_datestamp || '—'
      }));
      if (Table){ Table.mount(box, { columns: headers, rows: mapped, rowActions: ['Edit','Delete'] }); }
      else { renderTableInto(box, headers, mapped); }
    }catch(e){ box.innerHTML = `<div class="text-muted">${safeMsg(e)}</div>`; }
  }

  // ----- COA helpers: accordion and code generation -----
  function normType(t){
    const s = String(t||'').toLowerCase();
    if (s.startsWith('asset')) return 'Asset';
    if (s.startsWith('liab')) return 'Liability';
    if (s.startsWith('equ')) return 'Equity';
    if (s.startsWith('rev') || s.startsWith('inc')) return 'Income';
    if (s.startsWith('exp')) return 'Expenses';
    return t || '—';
  }
  function typeLabel(t){ return normType(t); }
  function renderCoaAccordion(box, rows, cats){
    const order = ['Asset','Liability','Equity','Income','Expenses'];
    const wrap = el('div'); wrap.id = 'coaAccordion';
    order.forEach((t, i)=>{
      const grpRows = (rows||[]).filter(r=> normType(r.type)===t);
      const grpCats = (cats||[]).filter(c=> normType(c.type)===t);
      const item = el('div', 'mb-2');
      const hdr = el('button', 'btn btn-light w-100 d-flex justify-content-between');
      hdr.setAttribute('data-bs-toggle','collapse');
      const cid = `coa_acc_${i}`; hdr.setAttribute('data-bs-target', `#${cid}`);
      // Sum type balance
      const typeTotal = grpRows.reduce((sum, r)=>{ const bal = getBranchLedger(); const map = bal[r.code]||{}; const s = Object.values(map).reduce((a,b)=>a+Number(b||0),0); return sum+s; }, 0);
      hdr.innerHTML = `<span class="me-2 text-muted">▸</span><span>${typeLabel(t)}</span><span class="ms-auto">${grpRows.length} items • Total: ${typeTotal}</span>`;
      const body = el('div', 'collapse'); body.id = cid;
      body.addEventListener('show.bs.collapse', ()=>{ const s = hdr.querySelector('span'); if (s) s.textContent='▾'; });
      body.addEventListener('hide.bs.collapse', ()=>{ const s = hdr.querySelector('span'); if (s) s.textContent='▸'; });
      const inner = el('div', 'p-2');
      // For each COA item, render its own accordion with > icon
      grpRows.forEach((acc, j)=>{
        const accHdr = el('button', 'btn btn-outline-light border w-100 d-flex justify-content-between align-items-center mb-1');
        accHdr.setAttribute('data-bs-toggle','collapse');
        const accId = `coa_item_${i}_${j}`; accHdr.setAttribute('data-bs-target', `#${accId}`);
        // total per account across branches
        const led = getBranchLedger(); const per = led[acc.code] || {}; const accTotal = Object.values(per).reduce((a,b)=>a+Number(b||0),0);
        accHdr.innerHTML = `<span class="me-2 text-muted">▸</span><span>${acc.name}</span><span class="ms-3 text-muted">Code: ${acc.code}</span><span class="ms-auto">Total: ${accTotal}</span>`;
        const accBody = el('div', 'collapse'); accBody.id = accId;
        accBody.addEventListener('show.bs.collapse', ()=>{ const s = accHdr.querySelector('span'); if (s) s.textContent='▾'; });
        accBody.addEventListener('hide.bs.collapse', ()=>{ const s = accHdr.querySelector('span'); if (s) s.textContent='▸'; });
        const accInner = el('div', 'p-2 border rounded');
        // Filter input (labelled Account Category)
        const filt = el('div','mb-2'); filt.innerHTML = '<input id="f_'+accId+'" class="form-control form-control-sm" placeholder="Search Account Category" />';
        accInner.appendChild(filt);
        // Build nested accordion rows: aggregated then branches
        const tblBox = el('div');
        function renderRows(){
          const rows = [];
          // Aggregated row first
          rows.push({ Name: acc.name, Code: acc.code, Branch: 'All Branches', Balance: accTotal, Key: keyFor(acc), BranchKey: null });
          const led2 = getBranchLedger(); const subn = getSubNames();
          const m = led2[acc.code] || {}; const subMap = subn[acc.code] || {};
          const keys = Array.from(new Set([ ...Object.keys(m), ...Object.keys(subMap) ]));
          keys.forEach(br=>{ const nm = (subMap[br]) || (acc.name + ' Sub'); rows.push({ Name: nm, Code: acc.code, Branch: br, Balance: Number(m[br]||0), Key: keyFor(acc), BranchKey: br }); });
          const q = (document.getElementById('f_'+accId)?.value||'').toLowerCase();
          const filtered = q ? rows.filter(r=> String(r.Name).toLowerCase().includes(q)) : rows;
          // Render nested accordion list
          function sid(str){ return String(str||'').replace(/[^a-z0-9_-]+/ig,'_'); }
          const list = document.createElement('div');
          filtered.forEach((row, idx)=>{
            const sh = document.createElement('button'); sh.className = 'btn btn-light w-100 d-flex align-items-center justify-content-between mb-1';
            const subId = `sub_${accId}_${sid(row.Branch||'all')}_${idx}`;
            sh.setAttribute('data-bs-toggle','collapse'); sh.setAttribute('data-bs-target', `#${subId}`);
            const left = document.createElement('div'); left.className='d-flex gap-3 align-items-center';
            const icon = document.createElement('span'); icon.className='text-muted'; icon.textContent='▸'; left.appendChild(icon);
            const name = document.createElement('span'); name.textContent = row.Name; left.appendChild(name);
            const code = document.createElement('span'); code.className='text-muted'; code.textContent = `Code: ${row.Code}`; left.appendChild(code);
            const branch = document.createElement('span'); branch.className='text-muted'; branch.textContent = `Branch: ${row.Branch}`; left.appendChild(branch);
            sh.appendChild(left);
            const right = document.createElement('div'); right.className='d-flex align-items-center gap-3';
            const bal = document.createElement('span'); bal.textContent = `Balance: ${row.Balance}`; right.appendChild(bal);
            const btn = document.createElement('button'); btn.className='btn btn-outline-secondary btn-sm'; btn.innerHTML='⋮'; btn.title='Add SubAccount'; btn.addEventListener('click', (ev)=>{ ev.stopPropagation(); openAddModal(row.Key, row.BranchKey); }); right.appendChild(btn);
            sh.appendChild(right);
            const sb = document.createElement('div'); sb.className='collapse'; sb.id = subId;
            const cont = document.createElement('div'); cont.className='p-2 border rounded';
            const meta = getSubMeta(); const metaMap = meta[row.Code]||{}; const info = metaMap[row.Branch||'All Branches'] || {};
            cont.innerHTML = [
              `<div><strong>Description:</strong> ${info.description||'—'}</div>`,
              `<div><strong>Currency:</strong> ${info.currency||'—'}</div>`
            ].join('');
            sb.appendChild(cont);
            // rotate caret on show/hide
            sb.addEventListener('show.bs.collapse', ()=>{ icon.textContent='▾'; });
            sb.addEventListener('hide.bs.collapse', ()=>{ icon.textContent='▸'; });
            list.appendChild(sh); list.appendChild(sb);
          });
          tblBox.innerHTML=''; tblBox.appendChild(list);
        }
        document.addEventListener('input', (e)=>{ if (e.target && e.target.id === 'f_'+accId) renderRows(); });
        renderRows();
        accInner.appendChild(tblBox); accBody.appendChild(accInner);
        inner.appendChild(accHdr); inner.appendChild(accBody);
      });
      body.appendChild(inner); item.appendChild(hdr); item.appendChild(body); wrap.appendChild(item);
    });
    box.innerHTML=''; box.appendChild(wrap);
  }
  async function getCoaRows(){ if (COA_CACHE) return COA_CACHE; const r = await apiGet('/admin/crud/Chart_of_Accounts'); COA_CACHE = r||[]; return COA_CACHE; }
  function baseForType(t){ if (/asset/i.test(t)) return 1000; if (/liab/i.test(t)) return 2000; if (/equity/i.test(t)) return 3000; if (/rev|income/i.test(t)) return 4000; if (/exp/i.test(t)) return 5000; return 9000; }
  function computeNextCode(type, catId){
    const arr = (COA_CACHE||[]).filter(r=> (r.type||'').toLowerCase()===String(type||'').toLowerCase());
    const inCat = catId ? arr.filter(r=> String(r.category_id||'')===String(catId)) : arr;
    const nums = inCat.map(r=> parseInt(String(r.code||'').replace(/[^0-9]/g,''),10)).filter(n=>!isNaN(n));
    const base = baseForType(type); const max = nums.length? Math.max(...nums): (base-1); return String(max+1);
  }

  // Create SubAccount (Chart of Accounts) modal
  function ensureCoaModal(){
    if ($('coaModal')) return;
    const modal = document.createElement('div'); modal.className='modal'; modal.id='coaModal'; modal.tabIndex=-1;
    modal.innerHTML = [
      '<div class="modal-dialog">',
      '<div class="modal-content">',
      '<div class="modal-header"><h6 class="modal-title">Create SubAccount <span id="coaTypeBadge" class="text-muted"></span></h6>',
      '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>',
      '<div class="modal-body">',
      '<form id="coaForm" class="row g-2">',
      '<div class="col-12"><label class="form-label">Account name</label><input id="sub_name" class="form-control" required/></div>',
      '<div class="col-12 form-check ms-1"><input id="sub_all_br" type="checkbox" class="form-check-input" checked/><label class="form-check-label">All Branches</label></div>',
      '<div id="branch_wrap" class="col-md-6 d-none"><label class="form-label">Branch</label><input id="sub_branch" class="form-control" placeholder="e.g., Main"/></div>',
      '<div class="col-12"><label class="form-label">Account Categories</label><select id="sub_category" class="form-select"><option value="">— Select Account Category —</option></select></div>',
      '<div class="col-12"><label class="form-label">Description</label><input id="sub_desc" class="form-control"/></div>',
      '<div class="col-md-6"><label class="form-label">Currency</label><select id="sub_currency" class="form-select"><option value="">— Select Currency —</option><option>UGX</option><option>USD</option><option>KES</option><option>TZS</option></select></div>',
      '</form>',
      '</div>',
      '<div class="modal-footer">',
      '<button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Close</button>',
      '<button type="button" class="btn btn-primary btn-sm" id="coaSaveBtn">Save</button>',
      '</div></div></div>'
    ].join('');
    document.body.appendChild(modal);
    $('coaSaveBtn').addEventListener('click', saveCoaModal);
    modal.addEventListener('shown.bs.modal', prepCoaModal);
  }

  async function prepCoaModal(){
    const catSel = $('sub_category'); if (!catSel) return; catSel.innerHTML='';
    const list = getCoaList();
    const byType = {}; list.forEach(it => { const t = normType(it.type); (byType[t]||(byType[t]=[])).push(it); });
    Object.keys(byType).forEach(t => {
      const og = document.createElement('optgroup'); og.label = t;
      byType[t].forEach(it => { const o = document.createElement('option'); o.value = keyFor(it); o.dataset.type = t; o.dataset.code = it.code; o.textContent = `${it.name} (${it.code})`; og.appendChild(o); });
      catSel.appendChild(og);
    });
    if (ADD_MODAL_PRESELECT){ catSel.value = ADD_MODAL_PRESELECT; }
    const badge = document.getElementById('coaTypeBadge');
    function bracketLabel(t){ if (t==='Asset') return '[Assets]'; if (t==='Liability') return '[Liabilities]'; return `[${t}]`; }
    function updateBadge(){ const opt = catSel.selectedOptions[0]; const t = opt?.dataset?.type || ''; badge.textContent = t ? ' '+bracketLabel(t) : ''; }
    updateBadge(); catSel.addEventListener('change', updateBadge);
    // Branch toggle
    const cb = $('sub_all_br'); const bw = $('branch_wrap');
    function toggleBranch(){ bw.classList.toggle('d-none', !!cb.checked); if (ADD_MODAL_PREF_BRANCH){ if (!cb.checked){ $('sub_branch').value = ADD_MODAL_PREF_BRANCH; } } }
    cb.addEventListener('change', toggleBranch);
    if (ADD_MODAL_PREF_BRANCH){ cb.checked = false; toggleBranch(); } else { cb.checked = true; toggleBranch(); }
  }

  async function saveCoaModal(){
    try{
      const catSel = $('sub_category'); const key = catSel?.value; if (!key){ showAlert('Select Account Category','danger'); return; }
      const it = getItemByKey(key); if (!it){ showAlert('Invalid category','danger'); return; }
      const name = $('sub_name').value?.trim(); if (!name){ showAlert('Account name is required','danger'); return; }
      const allb = !!$('sub_all_br').checked; const br = allb ? 'All Branches' : ($('sub_branch').value?.trim() || 'Unnamed Branch');
      const desc = $('sub_desc').value?.trim() || null; const cur = $('sub_currency').value || null;
      // Store subaccount name per code+branch
      const sn = getSubNames(); const map = sn[it.code] || {}; map[br] = name; sn[it.code] = map; saveSubNames(sn);
      // Store subaccount meta
      const sm = getSubMeta(); const mm = sm[it.code] || {}; mm[br] = { name, branch: br, description: desc, currency: cur, category: key, type: it.type }; sm[it.code] = mm; saveSubMeta(sm);
      const modalEl = $('coaModal'); if (modalEl && window.bootstrap?.Modal){ bootstrap.Modal.getInstance(modalEl)?.hide(); }
      showToast('SubAccount created');
      await loadCoa();
    }catch(e){ showAlert(safeMsg(e), 'danger'); }
  }

  // ----- Account Categories Tab -----
  function renderCategoriesUI(container){
    const head = el('div', 'd-flex justify-content-between align-items-center mb-2');
    const title = el('h6', 'mb-0'); title.textContent = 'Account Categories';
    head.appendChild(title);
    const box = el('div'); box.id = 'cat_table_box';
    container.innerHTML=''; container.appendChild(head); container.appendChild(box);
    loadCategories();
  }
  async function loadCategories(){
    const box = $('cat_table_box'); if (!box) return;
    try{
      const rows = getCoaList();
      const wrap = el('div', 'table-wrap');
      const tbl = el('table', 'table table-sm align-middle');
      const thead = el('thead'); const trh = el('tr'); ['Type','Name','Code','Actions'].forEach(h=>{ const th = el('th'); th.textContent=h; trh.appendChild(th); }); thead.appendChild(trh);
      const tbody = el('tbody');
      rows.forEach(r=>{
        const tr = el('tr');
        const tdT = el('td'); tdT.textContent = typeLabel(r.type||''); tr.appendChild(tdT);
        const tdN = el('td'); tdN.textContent = r.name || '—'; tr.appendChild(tdN);
        const tdC = el('td');
        const key = keyFor(r);
        if (String(CAT_EDIT_ID)===String(key)){
          const g = el('div','d-flex gap-2');
          const inp = el('input','form-control form-control-sm'); inp.value = r.code || '';
          const ok = el('button','btn btn-primary btn-sm'); ok.textContent='Update';
          const cancel = el('button','btn btn-outline-secondary btn-sm'); cancel.textContent='Cancel';
          ok.addEventListener('click', async ()=>{ setCategoryCodeLocal(key, inp.value); CAT_EDIT_ID=null; loadCategories(); await loadCoa(); showToast('Updated'); });
          cancel.addEventListener('click', ()=>{ CAT_EDIT_ID=null; loadCategories(); });
          g.appendChild(inp); g.appendChild(ok); g.appendChild(cancel); tdC.appendChild(g);
        } else { tdC.textContent = r.code || '—'; }
        tr.appendChild(tdC);
        const tdA = el('td'); const pen = el('button','btn btn-outline-secondary btn-sm'); pen.innerHTML='✎'; pen.title='Edit Code'; pen.addEventListener('click', ()=>{ CAT_EDIT_ID = key; loadCategories(); }); tdA.appendChild(pen); tr.appendChild(tdA);
        tbody.appendChild(tr);
      });
      tbl.appendChild(thead); tbl.appendChild(tbody); wrap.appendChild(tbl); box.innerHTML=''; box.appendChild(wrap);
    }catch(e){ box.innerHTML = `<div class="text-muted">${safeMsg(e)}</div>`; }
  }

  function setupUI(){
    initTransactionAccounts();
    initAccountingCore();
    initPayables();
    initReceivables();
    initTillSheets();
  }

  Admin.Accounting = { setupUI };
})();
