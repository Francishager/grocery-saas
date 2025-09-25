(function initConfig(){
  window.APP_CONFIG = window.APP_CONFIG || {};

  function getQueryParam(name){
    try { return new URLSearchParams(window.location.search).get(name); } catch { return null; }
  }

  const isLocal = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
  const isGhPages = (location.hostname === 'francishager.github.io' && location.pathname.startsWith('/grocery-saas'));
  const isNetlify = /\.netlify\.app$/i.test(location.hostname);
  const fromQuery = (getQueryParam('api') || '').trim();
  const fromStorage = (localStorage.getItem('API_URL') || '').trim();
  const preset = (window.APP_CONFIG.API_URL || '').trim();

  if (fromQuery){
    try { localStorage.setItem('API_URL', fromQuery); } catch {}
  }

  const domainDefault = (isGhPages || isNetlify) ? 'https://grocery-saas.onrender.com' : '';
  const api = fromQuery || fromStorage || preset || (isLocal ? 'http://localhost:3000' : domainDefault);
  window.APP_CONFIG.API_URL = api;
  // Expose to App namespace for js/api.js consumers
  window.App = window.App || {};
  if (!window.App.API_URL) window.App.API_URL = api;

  if (!api && !isLocal){
    console.warn('APP_CONFIG.API_URL is not set. Provide ?api=https://your-api.example.com in the URL or set localStorage.API_URL to your backend base URL.');
  }
})();
