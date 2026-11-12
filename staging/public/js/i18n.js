(function(){
  const App = window.App || (window.App = {});
  const Store = window.App.Store || window.Store;

  const DEFAULT_LOCALE = 'en-US';
  const DEFAULT_CURRENCY = 'USD';

  const translations = {
    'en-US': {
      nav: {
        'section-dashboard': 'Dashboard',
        'section-businesses': 'Businesses',
        'section-subs-all': 'All Subscriptions',
        'section-plans': 'Plans & Pricing',
        'section-features': 'Business Feature Overrides',
        'section-settings-shop': 'Shop Settings',
        'section-settings-fiscal': 'Fiscal Year Settings',
        'section-settings-currencies': 'Currencies'
      },
      headings: {
        'section-businesses': 'All Businesses',
        'section-plans': 'Subscription Plans',
        'section-settings-shop': 'Shop Settings',
        'section-settings-fiscal': 'Fiscal Year Settings',
        'section-settings-currencies': 'Currencies'
      },
      actions: {
        createTenant: 'Create Tenant',
        exportExcel: 'Export Excel',
        exportPDF: 'Export PDF'
      },
      charts: { profit: 'Profit' },
      table: {
        businesses: {
          name: 'Name',
          businessId: 'Business ID',
          tier: 'Tier',
          active: 'Active',
          created: 'Created',
          actions: 'Actions'
        }
      }
    },
    'lg-UG': {
      nav: {
        'section-dashboard': 'Akapeesa Ak’enkungaana',
        'section-businesses': 'Amaduuka',
        'section-subs-all': 'Obuwandiike bwonna',
        'section-plans': 'Emisolo n’Emirundi',
        'section-features': 'Ebikolebwa by’ebyobusobozi',
        'section-settings-shop': 'Enteekateeka z’Edduuka',
        'section-settings-fiscal': 'Enteekateeka z’Omwaka gw’Ensimbi',
        'section-settings-currencies': 'Sente'
      },
      headings: {
        'section-businesses': 'Amaduuka gonna',
        'section-plans': 'Emisolo g’Obuwumbi',
        'section-settings-shop': 'Enteekateeka z’Edduuka',
        'section-settings-fiscal': 'Enteekateeka z’Omwaka gw’Ensimbi',
        'section-settings-currencies': 'Sente'
      },
      actions: {
        createTenant: 'Tandikka Omusuubuzi',
        exportExcel: 'Fulumya mu Excel',
        exportPDF: 'Fulumya mu PDF'
      },
      charts: { profit: 'Amagoba' },
      table: {
        businesses: {
          name: 'Linya',
          businessId: 'Business ID',
          tier: 'Ettalanda',
          active: 'Kikolamu',
          created: 'Bwekolebwa',
          actions: 'Ebikolwa'
        }
      }
    },
    'sw-KE': {
      nav: {
        'section-dashboard': 'Dashibodi',
        'section-businesses': 'Biashara',
        'section-subs-all': 'Usajili Wote',
        'section-plans': 'Mipango na Bei',
        'section-features': 'Vipengele vya Biashara',
        'section-settings-shop': 'Mipangilio ya Duka',
        'section-settings-fiscal': 'Mwaka wa Fedha',
        'section-settings-currencies': 'Sarafu'
      },
      headings: {
        'section-businesses': 'Biashara Zote',
        'section-plans': 'Mipango ya Usajili',
        'section-settings-shop': 'Mipangilio ya Duka',
        'section-settings-fiscal': 'Mipangilio ya Mwaka wa Fedha',
        'section-settings-currencies': 'Sarafu'
      },
      actions: {
        createTenant: 'Unda Biashara',
        exportExcel: 'Hamisha Excel',
        exportPDF: 'Hamisha PDF'
      },
      charts: { profit: 'Faida' },
      table: {
        businesses: {
          name: 'Jina',
          businessId: 'Business ID',
          tier: 'Kiwango',
          active: 'Hai',
          created: 'Imeundwa',
          actions: 'Vitendo'
        }
      }
    }
  };

  function getLocale(){ try { return localStorage.getItem('app_locale') || DEFAULT_LOCALE; } catch { return DEFAULT_LOCALE; } }
  function getCurrency(){ try { return localStorage.getItem('app_currency') || DEFAULT_CURRENCY; } catch { return DEFAULT_CURRENCY; } }
  function setLocale(locale){ try { localStorage.setItem('app_locale', locale); } catch {} }
  function setCurrency(curr){ try { localStorage.setItem('app_currency', curr); } catch {} }

  function t(section, key){
    const loc = getLocale();
    return translations[loc]?.[section]?.[key] || translations[DEFAULT_LOCALE]?.[section]?.[key] || key;
  }

  function formatCurrency(n){
    const loc = getLocale();
    const cur = getCurrency();
    try { return new Intl.NumberFormat(loc, { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(Number(n||0)); }
    catch { return new Intl.NumberFormat(DEFAULT_LOCALE, { style: 'currency', currency: DEFAULT_CURRENCY }).format(Number(n||0)); }
  }

  function applyLanguage(){
    const loc = getLocale();
    const nav = document.getElementById('sidebarNav');
    if (nav){
      nav.querySelectorAll('a.nav-link[data-target]').forEach(a=>{
        const target = a.getAttribute('data-target');
        if (target) a.textContent = translations[loc]?.nav?.[target] || a.textContent;
      });
    }
    // Page title is set elsewhere based on section; we keep it dynamic.
    // Update headings for known sections
    const map = translations[loc]?.headings || {};
    Object.entries(map).forEach(([sectionId, text])=>{
      const section = document.getElementById(sectionId);
      if (!section) return;
      const h5 = section.querySelector('h5');
      if (h5) h5.textContent = text;
    });
    // Buttons
    const createBtn = document.getElementById('createBusinessBtn');
    if (createBtn) createBtn.textContent = translations[loc]?.actions?.createTenant || createBtn.textContent;
    const fab = document.getElementById('fabCreate');
    if (fab) { fab.textContent = translations[loc]?.actions?.createTenant || fab.textContent; fab.title = fab.textContent; }

    // Table headers: Businesses
    const bizHead = document.querySelector('#businessesTable thead tr');
    if (bizHead) {
      const ths = bizHead.querySelectorAll('th');
      const t = translations[loc]?.table?.businesses;
      if (t && ths.length >= 6){
        ths[0].textContent = t.name;
        ths[1].textContent = t.businessId;
        ths[2].textContent = t.tier;
        ths[3].textContent = t.active;
        ths[4].textContent = t.created;
        ths[5].textContent = t.actions;
      }
    }

    // Apply generic [data-i18n] attributes anywhere on the page
    const deepGet = (obj, path)=>{
      return String(path||'').split('.').reduce((acc, k)=> (acc && acc[k] != null ? acc[k] : null), obj);
    };
    document.querySelectorAll('[data-i18n]').forEach(node=>{
      const key = node.getAttribute('data-i18n');
      const val = deepGet(translations[loc]||{}, key);
      if (typeof val === 'string' && val) node.textContent = val;
    });
  }

  function applySelectors(){
    const langSel = document.getElementById('langSelect');
    const curSel = document.getElementById('currencySelect');
    if (langSel) langSel.value = getLocale();
    if (curSel) curSel.value = getCurrency();
    if (langSel && !langSel._bound){
      langSel._bound = true;
      langSel.addEventListener('change', ()=>{ setLocale(langSel.value); apply(); });
    }
    if (curSel && !curSel._bound){
      curSel._bound = true;
      curSel.addEventListener('change', ()=>{ setCurrency(curSel.value); apply(); });
    }

    // Build mobile dropdown menus from desktop selects to keep options in sync
    const buildMenu = (menuEl, sourceSelect, type)=>{
      if (!menuEl || !sourceSelect) return;
      const current = type==='lang' ? getLocale() : getCurrency();
      const items = Array.from(sourceSelect.options).map(opt=>({ value: opt.value, label: opt.textContent }));
      menuEl.innerHTML = '<div class="dropdown-header">'+ (type==='lang' ? 'Language' : 'Currency') +'</div>' + items.map(it=>{
        const active = (it.value===current) ? 'active fw-semibold' : '';
        return `<button type="button" class="dropdown-item ${active}" data-set-${type}="${it.value}">${it.label}</button>`;
      }).join('');
      if (!menuEl._bound){
        menuEl._bound = true;
        menuEl.addEventListener('click', (e)=>{
          const btn = e.target.closest('[data-set-'+type+']');
          if (!btn) return;
          const val = btn.getAttribute('data-set-'+type);
          if (type==='lang') setLocale(val); else setCurrency(val);
          apply();
        });
      }
    };
    buildMenu(document.getElementById('langMenuMobile'), langSel, 'lang');
    buildMenu(document.getElementById('currencyMenuMobile'), curSel, 'currency');
  }

  function rerenderData(){
    // Dashboard KPIs/Charts
    try { if (window.App?.Admin?.Dashboard?.load) App.Admin.Dashboard.load(); } catch {}
    // Plans table shows price
    try { if (window.App?.Admin?.Plans?.loadTable) App.Admin.Plans.loadTable(); } catch {}
    // Businesses list (heading language)
    try { if (window.App?.Admin?.Businesses?.loadList) App.Admin.Businesses.loadList(); } catch {}
    // Billing invoices amounts
    try { if (window.App?.Admin?.Billing?.loadInvoices) App.Admin.Billing.loadInvoices(); } catch {}
    // Stock/Product/Sales/Purchases tables
    try { if (window.App?.Admin?.Stock?.refreshAll) App.Admin.Stock.refreshAll(); } catch {}
    // Public dashboard
    try { if (typeof window.loadDashboard === 'function') window.loadDashboard(); } catch {}
  }

  function apply(){
    applySelectors();
    applyLanguage();
    rerenderData();
  }

  App.I18n = { getLocale, getCurrency, setLocale, setCurrency, setLocaleCurrency: (loc,cur)=>{ setLocale(loc); setCurrency(cur); apply(); }, formatCurrency, t, apply };

  document.addEventListener('DOMContentLoaded', apply);
})();
