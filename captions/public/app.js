const $ = id => document.getElementById(id);
const D = {
  en: {}, 
  ru: { drop: 'Перетащи видео сюда или нажми', dropsub: 'Любое видео: вертикальное, горизонтальное или квадратное', h_text: 'Текст', spoken: 'Язык речи', recog: 'Распознать речь', or: 'или', imp: 'Загрузить .srt', trans: 'Перевести на', translate: 'Перевести', back: 'Вернуть оригинал', regroup: 'Сгруппировать заново', redo: 'Распознать заново', h_style: 'Стиль', h_set: 'Настройки', accent: 'Цвет акцента', own: 'Как в стиле', size: 'Размер', lines: 'Строк', pos: 'Вверх / вниз', posx: 'Влево / вправо', dragnote: 'Субтитры можно перетаскивать прямо в превью.', font: 'Шрифт', fontnote: 'Для других алфавитов (китайский, арабский, тайский…) берётся системный шрифт, в котором есть эти буквы.', h_out: 'Результат', burn: 'Вшить субтитры в видео', dlv: 'Скачать видео', auto: 'авто', recognizing: 'Распознаю речь…', translating: 'Перевожу…', rendering: 'Рендерю…', done: 'Готово' },
  uk: { drop: 'Перетягни відео сюди або натисни', dropsub: 'Будь-яке відео: вертикальне, горизонтальне або квадратне', h_text: 'Текст', spoken: 'Мова мовлення', recog: 'Розпізнати мовлення', or: 'або', imp: 'Завантажити .srt', trans: 'Перекласти на', translate: 'Перекласти', back: 'Повернути оригінал', regroup: 'Згрупувати заново', redo: 'Розпізнати заново', h_style: 'Стиль', h_set: 'Налаштування', accent: 'Колір акценту', own: 'Як у стилі', size: 'Розмір', lines: 'Рядків', pos: 'Вгору / вниз', posx: 'Вліво / вправо', dragnote: 'Субтитри можна перетягувати прямо в превʼю.', font: 'Шрифт', fontnote: 'Для інших алфавітів (китайська, арабська, тайська…) беремо системний шрифт, де є ці літери.', h_out: 'Результат', burn: 'Вшити субтитри у відео', dlv: 'Завантажити відео', auto: 'авто', recognizing: 'Розпізнаю мовлення…', translating: 'Перекладаю…', rendering: 'Рендерю…', done: 'Готово' }
};
let L = 'en'; try { L = localStorage.getItem('capLang') || (navigator.language || 'en').slice(0, 2); } catch {} if (!D[L]) L = 'en';
const EN = {};
function tr() { document.querySelectorAll('[data-t]').forEach(e => { const k = e.dataset.t; if (!(k in EN)) EN[k] = e.textContent; e.textContent = (D[L] && D[L][k]) || EN[k]; }); }
const T = (k, d) => (D[L] && D[L][k]) || d;
$('ui').value = L; $('ui').onchange = () => { L = $('ui').value; try { localStorage.setItem('capLang', L); } catch {} tr(); };
$('theme').onclick = () => VSTheme.cycle();

let job = null, META = null, style = 'hormozi', pvTimer = 0, pvBusy = false, pvAgain = false, posOn = false, accOn = false;
const J = async (u, body) => { const r = await fetch(u, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.status); return j; };

// ---------- upload ----------
const drop = $('drop');
drop.onclick = () => $('file').click();
drop.ondragover = e => { e.preventDefault(); drop.classList.add('on'); };
drop.ondragleave = () => drop.classList.remove('on');
drop.ondrop = e => { e.preventDefault(); drop.classList.remove('on'); if (e.dataTransfer.files[0]) up(e.dataTransfer.files[0]); };
$('file').onchange = () => $('file').files[0] && up($('file').files[0]);
function up(f) {
  $('uperr').textContent = ''; const bar = $('upbar'); bar.hidden = false; const i = bar.firstElementChild; i.style.width = '0';
  const x = new XMLHttpRequest(); x.open('POST', '/api/upload');
  x.upload.onprogress = e => { if (e.lengthComputable) i.style.width = Math.round(100 * e.loaded / e.total) + '%'; };
  x.onload = () => { bar.hidden = true; let j = {}; try { j = JSON.parse(x.responseText); } catch {} if (x.status !== 200) { $('uperr').textContent = j.error || 'Upload failed'; return; } open_(j); };
  x.onerror = () => { bar.hidden = true; $('uperr').textContent = 'Upload failed'; };
  const fd = new FormData(); fd.append('file', f); x.send(fd);
}

// ---------- boot ----------
async function boot() {
  META = await J('/api/meta');
  $('lang').innerHTML = `<option value="">Auto-detect</option>` + META.langs.map(l => `<option value="${l.code}">${l.name}</option>`).join('');
  $('to').innerHTML = META.langs.map(l => `<option value="${l.code}">${l.name}</option>`).join('');
  $('font').innerHTML = `<option value="">${T('own', "Style's own")}</option>` + META.fonts.map(f => `<option>${f.label}</option>`).join('');
  $('styles').innerHTML = META.styles.map(s => `<div class="st" data-id="${s.id}"><b style="color:${s.accent}">Aa</b>${s.label.replace(/\s*\(.*$/, '')}</div>`).join('');
  $('styles').onclick = e => { const d = e.target.closest('.st'); if (d) { style = d.dataset.id; marks(); preview(); } };
  tr();
  try { const id = new URLSearchParams(location.search).get('job') || localStorage.getItem('capJob'); if (id) open_(await J('/api/' + id + '/job')); } catch {}
}
function marks() { document.querySelectorAll('.st').forEach(d => d.classList.toggle('on', d.dataset.id === style)); }

function open_(j) {
  job = j; try { localStorage.setItem('capJob', j.id); } catch {}
  $('app').hidden = false; $('s1').hidden = true; marks(); show();
  $('scrub').value = 0; preview();
}
function show() {
  const has = job.cues && job.cues.length;
  $('nocues').hidden = !!has; $('hascues').hidden = !has; $('orig').hidden = !job.orig;
  if (job.target) $('to').value = job.target; if (job.lang) $('lang').value = job.lang;
  renderCues();
  ['dls', 'dls2'].forEach(i => $(i).href = '/api/' + job.id + '/srt'); ['dlt', 'dlt2'].forEach(i => $(i).href = '/api/' + job.id + '/txt');
  $('dl2').hidden = !has;
}
const fmtT = t => { const m = Math.floor(t / 60), s = (t % 60).toFixed(1); return m + ':' + s.padStart(4, '0'); };
function renderCues() {
  $('cues').innerHTML = (job.cues || []).map((c, i) => `<div class="cue"><input data-i="${i}" data-k="start" value="${c.start.toFixed(2)}"><input data-i="${i}" data-k="end" value="${c.end.toFixed(2)}"><input data-i="${i}" data-k="text" value="${c.text.replace(/"/g, '&quot;')}"></div>`).join('');
}
let saveT = 0;
$('cues').oninput = e => {
  const i = e.target.dataset.i; if (i === undefined) return;
  const k = e.target.dataset.k; job.cues[i][k] = k === 'text' ? e.target.value : +e.target.value;
  job.edited = true; clearTimeout(saveT); saveT = setTimeout(async () => { await J('/api/' + job.id + '/cues', { cues: job.cues }); preview(); }, 500);
};
$('cues').onfocusin = e => { const c = job.cues[e.target.dataset.i]; if (c) { $('scrub').value = Math.round(1000 * Math.min(1, (c.start + 0.2) / job.duration)); preview(); } };

// ---------- preview ----------
const opts = () => ({ style, accent: accOn ? $('accent').value : '', capScale: $('scale').value, capLines: $('lines').value, capY: posOn ? $('posy').value : '', capX: posOn ? $('posx').value : '', font: $('font').value });
const curT = () => +$('scrub').value / 1000 * job.duration;
function preview() {
  if (!job) return; clearTimeout(pvTimer); pvTimer = setTimeout(async () => {
    if (pvBusy) { pvAgain = true; return; }
    pvBusy = true; $('busy').hidden = false;
    try {
      const r = await fetch('/api/' + job.id + '/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...opts(), t: curT() }) });
      if (r.ok) $('pv').src = URL.createObjectURL(await r.blob()); else $('tkerr').textContent = (await r.json()).error;
    } catch {} pvBusy = false; $('busy').hidden = true; $('tinfo').textContent = fmtT(curT()) + ' / ' + fmtT(job.duration);
    if (pvAgain) { pvAgain = false; preview(); }
  }, 120);
}
$('scrub').oninput = preview;
['scale', 'lines', 'font', 'accent'].forEach(i => $(i).addEventListener('input', () => { if (i === 'accent') accOn = true; preview(); }));
$('posy').oninput = $('posx').oninput = () => { posOn = true; preview(); };
// drag the subtitles in the preview: the point under the pointer becomes the centre of the caption
let dragging = false;
function dragTo(e) {
  const r = $('pv').getBoundingClientRect(), cl = v => Math.min(0.95, Math.max(0.05, v));
  $('posx').value = cl((e.clientX - r.left) / r.width); $('posy').value = cl((e.clientY - r.top) / r.height); posOn = true; preview();
}
$('pv').style.cursor = 'crosshair'; $('pv').draggable = false;
$('pv').onpointerdown = e => { dragging = true; $('pv').setPointerCapture(e.pointerId); dragTo(e); e.preventDefault(); };
$('pv').onpointermove = e => { if (dragging) dragTo(e); };
$('pv').onpointerup = $('pv').onpointercancel = () => { dragging = false; };
$('posOff').onclick = () => { posOn = false; preview(); }; $('accOff').onclick = () => { accOn = false; preview(); };

// ---------- tasks ----------
async function wait(kind, bar, err) {
  const b = $(bar); b.hidden = false; err.textContent = '';
  for (;;) {
    await new Promise(r => setTimeout(r, 1200));
    const t = await J('/api/' + job.id + '/task');
    if (t.kind === kind || t.state === 'idle') { b.firstElementChild.style.width = (t.pct || 5) + '%'; }
    if (t.kind === kind && t.state === 'done') { b.hidden = true; return true; }
    if (t.kind === kind && t.state === 'error') { b.hidden = true; err.textContent = t.error; return false; }
  }
}
const busyBtn = (b, on) => { b.disabled = on; };
$('go').onclick = async () => { busyBtn($('go'), true); try { await J('/api/' + job.id + '/transcribe', { lang: $('lang').value }); if (await wait('transcribe', 'tkbar', $('tkerr'))) { job = await J('/api/' + job.id + '/job'); show(); preview(); } } catch (e) { $('tkerr').textContent = e.message; } busyBtn($('go'), false); };
$('redo').onclick = () => { job.cues = null; show(); };
$('tr').onclick = async () => { busyBtn($('tr'), true); try { await J('/api/' + job.id + '/translate', { to: $('to').value }); if (await wait('translate', 'tkbar', $('tkerr'))) { job = await J('/api/' + job.id + '/job'); show(); preview(); } } catch (e) { $('tkerr').textContent = e.message; } busyBtn($('tr'), false); };
$('orig').onclick = async () => { job = await J('/api/' + job.id + '/original', {}); show(); preview(); };
$('regroup').onclick = async () => { try { job = await J('/api/' + job.id + '/regroup', { style, capLines: $('lines').value }); show(); preview(); } catch (e) { $('tkerr').textContent = e.message; } };
$('srtBtn').onclick = () => $('srtFile').click();
$('srtFile').onchange = async () => { const f = $('srtFile').files[0]; if (!f) return; try { job = await J('/api/' + job.id + '/import-srt', { text: await f.text() }); show(); preview(); } catch (e) { $('tkerr').textContent = e.message; } };

$('burn').onclick = async () => {
  busyBtn($('burn'), true); $('dl').hidden = true;
  try { if (job.edited) await J('/api/' + job.id + '/cues', { cues: job.cues }); await J('/api/' + job.id + '/render', opts());
    if (await wait('render', 'rbar', $('rerr'))) { $('dlv').href = '/api/' + job.id + '/download'; $('dl').hidden = false; $('dl2').hidden = true; $('dls').href = '/api/' + job.id + '/srt'; $('dlt').href = '/api/' + job.id + '/txt'; }
  } catch (e) { $('rerr').textContent = e.message; } busyBtn($('burn'), false);
};
boot();
