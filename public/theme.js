// Theme (dark / light / auto) and accent colour. Loaded in <head> of every page so the page never flashes in the wrong colours.
(function () {
  const ACCENTS = { orchid: 'Orchid', cyan: 'Cyan', amber: 'Amber', coral: 'Coral', violet: 'Violet' };
  const get = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  function apply() {
    const t = get('theme', 'dark'), a = get('accent', 'orchid');
    document.documentElement.dataset.theme = t === 'auto' ? (mq && mq.matches ? 'light' : 'dark') : (t === 'light' ? 'light' : 'dark');
    document.documentElement.dataset.accent = ACCENTS[a] ? a : 'orchid';
  }
  apply();
  if (mq && mq.addEventListener) mq.addEventListener('change', apply);
  window.VSTheme = {
    ACCENTS, theme: () => get('theme', 'dark'), accent: () => get('accent', 'orchid'),
    setTheme(t) { try { localStorage.setItem('theme', t); } catch {} apply(); },
    setAccent(a) { try { localStorage.setItem('accent', a); } catch {} apply(); },
    cycle() { const n = { dark: 'light', light: 'auto', auto: 'dark' }[get('theme', 'dark')] || 'dark'; this.setTheme(n); return n; }
  };
})();
