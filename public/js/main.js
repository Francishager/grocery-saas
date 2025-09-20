(function(){
  const App = window.App || {};
  // Derive API base from current origin for portability
  App.API_URL = window.location.origin;
  // Chart color palette
  App.colors = {
    primary: '#0d6efd',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#06b6d4',
    slate: '#64748b',
    series: ['#0d6efd','#22c55e','#f59e0b','#ef4444','#06b6d4','#a78bfa','#14b8a6']
  };

  function isMobile(){ return window.matchMedia('(max-width: 991px)').matches; }

  function toggleSidebar(){
    const sb = document.querySelector('.sidebar');
    if (!sb) return;
    sb.classList.toggle('open');
  }

  function closeSidebar(){
    const sb = document.querySelector('.sidebar');
    if (sb) sb.classList.remove('open');
  }

  function setupSidebarToggle(){
    const btn = document.getElementById('sidebarToggle');
    if (btn) btn.addEventListener('click', (e)=>{ e.stopPropagation(); toggleSidebar(); });
    // Close when clicking outside on mobile
    document.addEventListener('click', (e)=>{
      const sb = document.querySelector('.sidebar');
      if (!sb) return;
      const clickedInsideSidebar = sb.contains(e.target);
      const clickedToggle = btn && btn.contains(e.target);
      if (isMobile() && sb.classList.contains('open') && !clickedInsideSidebar && !clickedToggle) {
        closeSidebar();
      }
    });
    // Close when a sidebar link is clicked (mobile)
    const nav = document.getElementById('sidebarNav');
    if (nav) nav.addEventListener('click', (e)=>{
      const link = e.target.closest('a');
      if (link && isMobile()) closeSidebar();
    });
  }

  App.closeSidebar = closeSidebar;
  App.ready = function(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  };

  window.App = App;
  App.ready(setupSidebarToggle);
})();
