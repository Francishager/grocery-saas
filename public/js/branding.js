(function(){
  function getUser(){
    try { return JSON.parse(localStorage.getItem('user')||'null'); } catch { return null; }
  }
  function setText(id, text){ const el = document.getElementById(id); if (el) el.textContent = text; }

  document.addEventListener('DOMContentLoaded', function(){
    const u = getUser();
    if (u){
      setText('profileName', u.fname ? `${u.fname} ${u.lname||''}`.trim() : (u.email||'User'));
      setText('sidebarUserName', u.fname ? `${u.fname} ${u.lname||''}`.trim() : (u.email||'User'));
      setText('sidebarUserRole', u.role || '—');
    }
    // ensure brand logo has src
    const logo = document.querySelector('.brand-logo');
    if (logo && !logo.getAttribute('src')){
      logo.setAttribute('src','img/logo.png');
    }
  });
})();
