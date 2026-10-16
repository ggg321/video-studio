// Shared top navigation for every page. Needs <header id="nav"></header> before this script.
// Menu: Projects, Tasks, Sources (library, Grok, Flow), the bell (team notices), Settings (keys, people and voices, Telegram, status).
// Uploads (a FormData with files): sent with progress, shown in a small panel in the corner; an error is told, not swallowed.
(function () {
  if (window.__upl) return; window.__upl = true;
  const orig = window.fetch.bind(window);
  const hasFile = b => { try { for (const v of b.values()) if (typeof File !== 'undefined' && v instanceof File && v.size > 0) return v; } catch {} return null; };
  let box = null;
  const panel = () => { if (box && document.body.contains(box)) return box; box = document.createElement('div'); box.id = 'uploadbar'; box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:9999;display:grid;gap:8px;max-width:340px'; document.body.appendChild(box); return box; };
  window.fetch = function (url, init) {
    if (!(init && init.body instanceof FormData && /^post$/i.test(init.method || 'GET')) || !hasFile(init.body) || !document.body) return orig(url, init);
    const f = hasFile(init.body), n = [...init.body.values()].filter(v => v instanceof File).length, label = (n > 1 ? n + ' files' : f.name) + ' (' + (([...init.body.values()].reduce((s, v) => s + (v instanceof File ? v.size : 0), 0)) / 1048576).toFixed(0) + ' MB)';
    const row = document.createElement('div'); row.style.cssText = 'background:var(--card,#151921);color:var(--tx,#eceff6);border:1px solid var(--line2,#303847);border-radius:12px;padding:10px 12px;box-shadow:0 8px 24px rgba(0,0,0,.35);font-size:13px';
    row.innerHTML = '<div style="display:flex;justify-content:space-between;gap:10px"><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></b><span class="p">0%</span></div><div style="height:5px;border-radius:3px;background:var(--line,#232938);margin-top:6px;overflow:hidden"><i style="display:block;height:100%;width:0;background:var(--ac,#ee7fc3)"></i></div>';
    row.querySelector('b').textContent = label; panel().appendChild(row);
    const done = (ok, msg) => { row.querySelector('.p').textContent = ok ? '✓' : '✕'; row.querySelector('i').style.width = '100%'; row.querySelector('i').style.background = ok ? 'var(--ok,#4cc38a)' : 'var(--danger,#f0626e)'; if (msg) { const m = document.createElement('div'); m.style.cssText = 'margin-top:6px;color:var(--bad-tx,#ff9aa3)'; m.textContent = msg; row.appendChild(m); } setTimeout(() => row.remove(), ok ? 2500 : 9000); };
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest(); x.open('POST', url);
      x.upload.onprogress = e => { if (e.lengthComputable) { const p = Math.round(100 * e.loaded / e.total); row.querySelector('.p').textContent = p + '%'; row.querySelector('i').style.width = p + '%'; } };
      x.onload = () => { const ok = x.status >= 200 && x.status < 300; let msg = ''; if (!ok) { try { msg = JSON.parse(x.responseText).error || ''; } catch {} msg = msg || ('The server answered with an error (' + x.status + ').'); } done(ok, msg); resolve(new Response(x.responseText, { status: x.status, headers: { 'Content-Type': x.getResponseHeader('Content-Type') || 'application/json' } })); };
      x.onerror = () => { done(false, 'The upload was interrupted.'); reject(new TypeError('Network error')); };
      x.send(init.body);
    });
  };
})();
(function () {
  const h = document.getElementById('nav');
  if (window.top !== window.self) { document.documentElement.classList.add('embedded'); if (h) h.style.display = 'none'; return; }   // pages shown inside another page have no menu of their own
  if (!h) return;
  const path = location.pathname;
  // Simple mode (a task board, one button) or Pro mode (projects and every setting). Remembered in this browser.
  try { if (['/', '/index.html', '/tasks.html'].includes(path)) localStorage.setItem('uiMode', 'pro'); else if (path === '/simple.html') localStorage.setItem('uiMode', 'simple'); } catch {}
  let mode = 'pro'; try { mode = localStorage.getItem('uiMode') === 'simple' ? 'simple' : 'pro'; } catch {}
  const is = list => list.includes(path) || (list.includes('/') && path === '/index.html');
  const on = list => is(list) ? ' on' : '';
  h.innerHTML =
    '<a class="brand" href="' + (mode === 'simple' ? '/simple.html' : '/') + '"><i>🎬</i><span>Video Studio</span></a>' +
    (mode === 'simple' ? '<a class="nl' + on(['/simple.html']) + '" href="/simple.html">Creatives</a>' : '<a class="nl' + on(['/']) + '" href="/">Projects</a><a class="nl' + on(['/tasks.html']) + '" href="/tasks.html">Tasks</a>') +
    '<a class="nl' + on(['/sources.html', '/library.html', '/flow.html', '/grok.html']) + '" href="/sources.html">Sources</a>' +
    '<a class="nl' + on(['/motion.html', '/typo.html']) + '" href="/motion.html" title="Complex animated videos">Motion</a>' +
    '<span class="sp"></span>' +
    '<span class="modesw" title="Simple: one button makes everything. Pro: every setting."><a class="' + (mode === 'simple' ? 'on' : '') + '" href="/simple.html">Simple</a><a class="' + (mode === 'pro' ? 'on' : '') + '" href="/">Pro</a></span>' +
    '<span class="bellwrap"><a class="nl" id="bell" title="Notices" role="button" aria-label="Notices">🔔<b id="bellN" class="bellN" style="display:none"></b></a><div id="bellp" class="bellp" style="display:none"></div></span>' +
    '<a class="nl' + on(['/settings.html', '/status.html', '/speakers.html']) + '" href="/settings.html" title="Keys, people and voices, Telegram, health">Settings <i class="dot" id="hdot"></i></a>' +
    '<a class="nl" id="themeBtn" title="Theme: dark, light, auto" role="button" aria-label="Theme"></a>' +
    '<select id="lang"><option value="en">English</option><option value="ru">Русский</option><option value="uk">Українська</option></select>';
  const tb = document.getElementById('themeBtn'), icon = () => { const t = window.VSTheme ? VSTheme.theme() : 'dark'; if (tb) tb.textContent = t === 'light' ? '☀' : t === 'auto' ? '◐' : '☾'; };
  if (tb) { icon(); tb.onclick = () => { VSTheme.cycle(); icon(); }; }
  const pulse = () => fetch('/api/status/brief').then(r => r.json()).then(s => { const d = document.getElementById('hdot'); if (d) { d.className = 'dot ' + (s.level === 'ok' ? 'done' : s.level === 'bad' ? 'err' : 'warn'); d.title = s.running ? 'Working' : ''; } }).catch(() => {});
  pulse(); setInterval(() => { if (!document.hidden) pulse(); }, 30000);

  // ---- the bell ----
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TT = s => (typeof T === 'function' ? T(s) : s);
  const ago = t => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  const badge = c => { const b = document.getElementById('bellN'); if (!b) return; b.textContent = c.unread > 99 ? '99+' : c.unread; b.style.display = c.unread ? '' : 'none'; };
  const count = () => fetch('/api/notices/count').then(r => r.json()).then(badge).catch(() => {});
  count(); setInterval(() => { if (!document.hidden) count(); }, 30000);
  let N = [];
  function item(n) {
    const open = n.state === 'new';
    if (n.kind === 'auto-approved') return `<div class="nt ${n.read ? '' : 'un'}"><div class="nh"><b>Approved automatically</b><span>${ago(n.at)}</span></div><div class="nb">${esc(n.text)}</div></div>`;
    const sel = open ? `<select id="nc_${n.id}">${(n.creatives || []).map(c => `<option value="${esc(c.id)}" ${n.hint && c.no === n.hint ? 'selected' : ''}>${c.no ? '#' + c.no + ' ' : ''}${esc(c.name)}</option>`).join('')}${(n.creatives || []).length > 1 ? '<option value="">All creatives</option>' : ''}</select>` : '';
    const sug = n.suggestion ? `<span class="chip ${n.suggestion === 'edit' ? 'wr' : 'wk'}">${n.suggestion === 'edit' ? 'looks like an edit' : 'looks like a text'}</span>` : '';
    const done = n.state === 'edit' ? 'Marked as an edit request' : n.state === 'material' ? 'Used as the script' : n.state === 'dismissed' ? 'Dismissed' : '';
    return `<div class="nt ${n.read ? '' : 'un'}"><div class="nh"><b>${esc(n.by)}</b><span>${esc(n.taskTitle || '')} · ${ago(n.at)}</span></div><div class="nb">${esc(String(n.text).slice(0, 400))}${String(n.text).length > 400 ? '…' : ''}</div>
      <div class="na">${sug}${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">Open in Asana</a>` : ''}</div>
      ${open ? `<div class="na">${sel}<button class="sm" onclick="bellAct('${n.id}','edit')">Edit request</button><button class="sm sec" onclick="bellAct('${n.id}','material')">Use as script</button><button class="sm sec" onclick="bellAct('${n.id}','dismiss')">Dismiss</button></div>` : `<div class="na" style="color:var(--mut)">${TT(done)}</div>`}</div>`;
  }
  async function draw() {
    const r = await fetch('/api/notices').then(x => x.json()).catch(() => ({ items: [] })); N = r.items || []; badge(r);
    const p = document.getElementById('bellp');
    p.innerHTML = `<div class="nth"><b>Notices</b><button class="sm sec" onclick="bellReadAll()">Mark all read</button></div>` + (N.length ? N.map(item).join('') : '<div class="nb" style="padding:16px;color:var(--mut)">Nothing new. Comments from buyers in Asana will appear here.</div>');
  }
  document.getElementById('bell').onclick = async e => { e.stopPropagation(); const p = document.getElementById('bellp'); if (p.style.display === 'none') { await draw(); p.style.display = ''; } else p.style.display = 'none'; };
  document.addEventListener('click', e => { const p = document.getElementById('bellp'); if (p && p.style.display !== 'none' && !p.contains(e.target)) p.style.display = 'none'; });
  window.bellReadAll = async () => { await fetch('/api/notices/read-all', { method: 'POST' }); draw(); };
  window.bellAct = async (id, action) => {
    const n = N.find(x => x.id === id), body = { action };
    const s = document.getElementById('nc_' + id); if (s && action !== 'dismiss') body.creativeId = s.value;
    let r = await fetch('/api/notices/' + id + '/act', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(x => x.json());
    if (r.needsForce && typeof uiConfirm === 'function' && await uiConfirm(TT('This creative already has a script. Replace it?'), TT('Replace'), true)) { body.force = true; r = await fetch('/api/notices/' + id + '/act', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(x => x.json()); }
    if (r.error) { if (typeof toast === 'function') toast(r.error); return; }
    if (typeof toast === 'function' && action !== 'dismiss') toast(action === 'edit' ? 'Marked as an edit request' : 'The script was replaced');
    await draw();
    if (typeof P !== 'undefined' && P && (r.done || []).includes(P.id) && typeof open_ === 'function') open_(P.id);
  };
  const st = document.createElement('style');
  st.textContent = '.modesw{display:flex;border:1px solid var(--line2,#2a2f3a);border-radius:8px;overflow:hidden;margin-right:8px}.modesw a{padding:4px 12px;font-size:12px;color:var(--mut);text-decoration:none}.modesw a.on{background:var(--ac-soft,rgba(120,140,255,.15));color:var(--ac,#7b93ff);font-weight:600}' +
    '.bellwrap{position:relative}#bell{position:relative}.bellN{position:absolute;top:1px;right:1px;min-width:16px;height:16px;border-radius:8px;background:var(--bad,#e5484d);color:#fff;font-size:10px;line-height:16px;text-align:center;padding:0 4px}' +
    '.bellp{position:absolute;right:0;top:44px;width:420px;max-height:70vh;overflow:auto;background:var(--surface,#161a22);border:1px solid var(--line,#2a2f3a);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.4);z-index:60}' +
    '.nth{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--line,#2a2f3a)}.nt{padding:10px 14px;border-bottom:1px solid var(--line,#2a2f3a);font-size:13px}.nt.un{background:var(--ac-soft,rgba(120,140,255,.08))}' +
    '.nh{display:flex;justify-content:space-between;gap:8px}.nh span{color:var(--mut);font-size:12px}.nb{margin:4px 0;white-space:pre-wrap;word-break:break-word}.na{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px}.na select{max-width:170px;min-height:30px;font-size:12px}' +
    'html.embedded body{padding-top:0}@media (max-width:600px){.bellp{position:fixed;left:8px;right:8px;top:56px;width:auto}}';
  document.head.appendChild(st);
})();
// small message at the bottom of the screen
window.toast = function (msg, ms) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = (typeof T === 'function' ? T(String(msg)) : String(msg)); t.style.display = '';
  clearTimeout(window.__tt2); window.__tt2 = setTimeout(() => { t.style.display = 'none'; }, ms || 4500);
};

// in-page replacements for prompt() / confirm(): nicer, translated, and they work in every browser pane
(function () {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function dlg() { let d = document.getElementById('uidlg'); if (!d) { d = document.createElement('dialog'); d.id = 'uidlg'; d.style.maxWidth = '480px'; document.body.appendChild(d); } return d; }
  function show(html, done) { const d = dlg(); d.innerHTML = html; d.onclose = () => done(d); if (!d.open) d.showModal(); return d; }
  const BTN = (okLabel, danger) => `<div class="row" style="margin-top:20px;gap:10px;flex-direction:row-reverse;justify-content:flex-start"><button value="ok" ${danger ? 'class="danger"' : ''}>${esc(okLabel || 'OK')}</button><button class="sec" value="cancel" formnovalidate>Cancel</button></div>`;
  window.uiPrompt = (title, def) => new Promise(res => {
    const d = show(`<form method="dialog"><h3>${esc(title)}</h3><input id="uip" value="${esc(def || '')}" autocomplete="off" style="margin-top:14px">${BTN('OK')}</form>`, x => res(x.returnValue === 'ok' ? x.querySelector('#uip').value.trim() : null));
    setTimeout(() => { const i = d.querySelector('#uip'); if (i) { i.focus(); i.select(); } }, 30);
  });
  window.uiConfirm = (msg, okLabel, danger) => new Promise(res => {
    show(`<form method="dialog"><h3>${esc(msg)}</h3>${BTN(okLabel, danger)}</form>`, x => res(x.returnValue === 'ok'));
  });
  // richer confirmation: html body (already escaped by the caller)
  window.uiAsk = (title, bodyHtml, okLabel) => new Promise(res => {
    show(`<form method="dialog"><h3>${esc(title)}</h3><div style="margin-top:10px">${bodyHtml}</div>${BTN(okLabel)}</form>`, x => res(x.returnValue === 'ok'));
  });
})();
