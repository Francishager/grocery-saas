(function(){
  const root = window.App || (window.App = {});
  const UI = root.UI || (root.UI = {});

  function $(sel, ctx){ return (ctx||document).querySelector(sel); }
  function el(tag, cls){ const e = document.createElement(tag); if (cls) e.className = cls; return e; }

  function normalize(rows, cols){
    return (rows||[]).map(r=>{
      const o = {}; cols.forEach(c=>{ o[c] = r[c] ?? r[c.toLowerCase()] ?? ''; }); return o;
    });
  }

  function renderActionsCell(actions, row){
    if (!actions || actions.length === 0){ return document.createTextNode(''); }
    const wrap = el('div', 'dropdown');
    const btn = el('button', 'btn btn-sm btn-outline-secondary');
    btn.type = 'button'; btn.textContent = '⋯'; btn.addEventListener('click', (e)=>{ e.stopPropagation(); menu.classList.toggle('show'); });
    const menu = el('div', 'dropdown-menu');
    actions.forEach(a=>{
      const item = el('button', 'dropdown-item'); item.type = 'button'; item.textContent = a;
      item.addEventListener('click', (e)=>{ e.stopPropagation(); menu.classList.remove('show'); wrap.dispatchEvent(new CustomEvent('table:action', { detail: { action: a, row } })); });
      menu.appendChild(item);
    });
    document.addEventListener('click', ()=> menu.classList.remove('show'));
    wrap.appendChild(btn); wrap.appendChild(menu); return wrap;
  }

  function mount(container, opts){
    const columns = (opts.columns||[]).slice();
    const rows = Array.isArray(opts.rows) ? opts.rows.slice() : [];
    const actions = opts.rowActions || [];
    const pageSizes = opts.pageSizes || [10, 20, 50, 100];
    const showActions = actions.length>0;
    const cols = showActions ? columns.concat('Actions') : columns;

    const wrap = el('div');
    const toolbar = el('div', 'd-flex flex-wrap gap-2 align-items-end mb-2');
    const searchBox = el('div');
    searchBox.innerHTML = '<label class="form-label small mb-1">Search</label><input class="form-control form-control-sm" placeholder="Search" />';
    const searchInput = searchBox.querySelector('input');

    const sizeBox = el('div');
    sizeBox.innerHTML = '<label class="form-label small mb-1">Rows</label><select class="form-select form-select-sm"></select>';
    const sizeSel = sizeBox.querySelector('select');
    pageSizes.forEach(n=>{ const o = document.createElement('option'); o.value=String(n); o.textContent=String(n); sizeSel.appendChild(o); }); sizeSel.value = String(pageSizes[0]);

    toolbar.appendChild(searchBox); toolbar.appendChild(sizeBox);

    const tableWrap = el('div', 'table-wrap');
    const table = el('table', 'table table-sm align-middle');
    const thead = el('thead'); const trh = el('tr');
    cols.forEach(h=>{ const th = el('th'); th.textContent = h; trh.appendChild(th); }); thead.appendChild(trh);
    const tbody = el('tbody');

    table.appendChild(thead); table.appendChild(tbody); tableWrap.appendChild(table);
    wrap.appendChild(toolbar); wrap.appendChild(tableWrap);

    container.innerHTML = ''; container.appendChild(wrap);

    function render(){
      const q = (searchInput.value||'').toLowerCase();
      const ps = parseInt(sizeSel.value, 10) || 10;
      const norm = normalize(rows, columns);
      const filtered = q ? norm.filter(r=> Object.values(r).some(v=> String(v).toLowerCase().includes(q))) : norm;
      const showRows = filtered.slice(0, ps);
      tbody.innerHTML='';
      if (showRows.length === 0){
        const tr = el('tr'); const td = el('td'); td.colSpan = cols.length; td.className='text-muted'; td.textContent='No data'; tr.appendChild(td); tbody.appendChild(tr); return;
      }
      showRows.forEach(r=>{
        const tr = el('tr');
        columns.forEach(h=>{ const td = el('td'); td.textContent = r[h] ?? '—'; tr.appendChild(td); });
        if (showActions){ const td = el('td'); td.appendChild(renderActionsCell(actions, r)); tr.appendChild(td); }
        tbody.appendChild(tr);
      });
    }

    searchInput.addEventListener('input', render);
    sizeSel.addEventListener('change', render);

    render();

    return {
      update(newRows){ rows.splice(0, rows.length, ...(Array.isArray(newRows)?newRows:[])); render(); },
      on(action, handler){ wrap.addEventListener('table:action', (e)=>{ if (e.detail?.action===action) handler(e.detail.row); }); }
    };
  }

  UI.Table = { mount };
})();
