(function(){
  // Simple RBAC/ABAC helper for vanilla JS
  // Define abilities from user role and optional features list

  function defineAbility(user, features){
    const role = (user?.role || '').toLowerCase();
    const feat = new Set((features || []).map(String));

    // Rules map: action: Set(subject)
    const can = new Map();
    function allow(action, subject){
      const k = String(action);
      if (!can.has(k)) can.set(k, new Set());
      can.get(k).add(String(subject));
    }

    // Baseline: no access
    if (role === 'saas admin'){
      // Full administrative abilities
      ['view','create','edit','delete','manage'].forEach(a=>allow(a,'all'));
    } else if (role === 'owner'){
      ['view','create','edit'].forEach(a=>allow(a,'business'));
      ['view'].forEach(a=>allow(a,'reports'));
      ['create','edit'].forEach(a=>allow(a,'sales'));
      if (feat.has('inventory')) ['view','edit','create'].forEach(a=>allow(a,'inventory'));
    } else if (role === 'accountant'){
      allow('view','business');
      allow('view','reports');
    } else if (role === 'attendant'){
      allow('create','sales');
      allow('view','sales');
    }

    function canDo(action, subject){
      if (can.get('manage')?.has('all')) return true;
      if (can.get(String(action))?.has('all')) return true;
      return can.get(String(action))?.has(String(subject)) || false;
    }

    function hasFeature(code){
      const c = String(code);
      if (feat.has('all')) return true;
      return feat.has(c);
    }

    return { can: canDo, hasFeature };
  }

  // DOM gating utilities
  function applyDomPermissions(ability, root){
    const ctx = root || document;
    // Hide elements user cannot do: data-can="action:subject"
    ctx.querySelectorAll('[data-can]')?.forEach(el=>{
      const expr = el.getAttribute('data-can');
      if (!expr) return;
      const parts = expr.split(',').map(s=>s.trim()).filter(Boolean);
      let visible = true;
      for (const p of parts){
        const [action, subject] = p.split(':').map(s=>s.trim());
        if (!ability.can(action, subject)) { visible = false; break; }
      }
      if (!visible) el.classList.add('d-none'); else el.classList.remove('d-none');
    });

    // Hide elements behind feature flags: data-feature="code" or "code1,code2" (OR)
    ctx.querySelectorAll('[data-feature]')?.forEach(el=>{
      const expr = (el.getAttribute('data-feature') || '').trim();
      const codes = expr.split(',').map(s=>s.trim()).filter(Boolean);
      let visible = false;
      if (codes.length === 0) { visible = true; }
      else {
        for (const c of codes){ if (ability.hasFeature(c)) { visible = true; break; } }
      }
      if (!visible) el.classList.add('d-none'); else el.classList.remove('d-none');
    });
  }

  const ACL = { defineAbility, applyDomPermissions };
  if (!window.App) window.App = {};
  window.ACL = ACL; window.App.ACL = ACL;
})();
