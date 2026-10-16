// Caption templates + animated cards, rendered as ASS subtitles.
const fmt = t => { const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`; };
const esc = s => s.replace(/[{}\\]/g, '');
// ASS colours are &HAABBGGRR. hex('#e5484d') -> BGR
const bgr = hex => { const h = hex.replace('#', ''); return `${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase(); };

// size: fraction of width (square/landscape) / (vertical); pos: fraction of height from the bottom
const TEMPLATES = {
  classic:  { label: 'Classic (white + red accent)', font: 'Arial', bold: 1, size: [0.062, 0.088], pos: [0.17, 0.26], words: 3, accent: '#ff0000', text: '#ffffff', outline: 1, upper: false, anim: 'pop', mode: 'longest' },
  impact:   { label: 'Impact (yellow, UPPERCASE)', font: 'Impact', bold: 0, size: [0.075, 0.105], pos: [0.17, 0.26], words: 2, accent: '#ffe100', text: '#ffffff', outline: 1, upper: true, anim: 'pop', mode: 'longest' },
  karaoke:  { label: 'Karaoke (word by word)', font: 'Arial', bold: 1, size: [0.066, 0.092], pos: [0.17, 0.26], words: 3, accent: '#00e5ff', text: '#ffffff', outline: 1, upper: false, anim: 'none', mode: 'spoken' },
  boxed:    { label: 'Box (black bar)', font: 'Segoe UI', bold: 1, size: [0.056, 0.078], pos: [0.15, 0.24], words: 4, accent: '#ffd400', text: '#ffffff', outline: 0, upper: false, anim: 'fade', mode: 'longest', box: true },
  minimal:  { label: 'Minimal (small, no accent)', font: 'Segoe UI', bold: 0, size: [0.045, 0.062], pos: [0.1, 0.18], words: 6, accent: '#ffffff', text: '#ffffff', outline: 1, upper: false, anim: 'fade', mode: 'none' },
  // "pop" family: heavy uppercase, soft shadow instead of an outline, no plate under the text
  pop:      { label: 'Pop (white + yellow key word, soft shadow)', font: 'Roboto Black', bold: 0, size: [0.074, 0.098], pos: [0.17, 0.25], words: 2, lines: 2, accent: '#ffe600', text: '#ffffff', outline: 0, upper: true, anim: 'blurpop', mode: 'longest', soft: true },
  poplabel: { label: 'Pop label (small line + big yellow word)', font: 'Roboto Black', bold: 0, size: [0.082, 0.108], pos: [0.17, 0.25], words: 3, lines: 1, accent: '#ffe600', text: '#ffffff', outline: 0, upper: true, anim: 'blurpop', mode: 'labelkey', soft: true },
  popnum:   { label: 'Pop numbers (numbers and prices in yellow)', font: 'Roboto Black', bold: 0, size: [0.074, 0.098], pos: [0.17, 0.25], words: 2, lines: 2, accent: '#ffe600', text: '#ffffff', outline: 0, upper: true, anim: 'blurpop', mode: 'numkey', soft: true },
  popword:  { label: 'Pop word by word (yellow follows the voice)', font: 'Roboto Black', bold: 0, size: [0.074, 0.098], pos: [0.17, 0.25], words: 2, lines: 2, accent: '#ffe600', text: '#ffffff', outline: 0, upper: true, anim: 'none', mode: 'spoken', soft: true },
  popwhite: { label: 'Pop white (all white, soft shadow)', font: 'Roboto Black', bold: 0, size: [0.074, 0.098], pos: [0.17, 0.25], words: 2, lines: 2, accent: '#ffffff', text: '#ffffff', outline: 0, upper: true, anim: 'blurpop', mode: 'none', soft: true },
  // second family, from the reference clips
  plate:    { label: 'Soft plate (words fill in as spoken)', font: 'Poppins Bold', fontCyr: 'Montserrat Bold', bold: 0, size: [0.06, 0.074], pos: [0.2, 0.27], words: 3, lines: 2, accent: '#a6a6a6', text: '#1c1c1c', plateCol: '#e9e7ea', outline: 0, upper: false, anim: 'none', mode: 'reveal' },
  colorpop: { label: 'Color pop (Montserrat, yellow / red / green lines)', font: 'Montserrat Black', bold: 0, size: [0.078, 0.1], pos: [0.17, 0.25], words: 2, lines: 2, accent: '#ffe600', pal: ['#ffe600', '#ff2a2a', '#22ee22'], text: '#ffffff', outline: 1, outW: 0.085, shad: 0.06, upper: true, anim: 'pop', mode: 'linecolor' },
  montpop:  { label: 'Montserrat pop (white, one coloured word)', font: 'Montserrat Black', bold: 0, size: [0.072, 0.094], pos: [0.17, 0.25], words: 2, lines: 2, accent: '#ffe600', pal: ['#ffe600', '#ff2a2a', '#22ee22'], text: '#ffffff', outline: 0, upper: true, anim: 'blurpop', mode: 'cyclekey', soft: true },
  condital: { label: 'Condensed italic (white, green and red words)', font: 'Bebas Neue', fontCyr: 'Oswald Bold', bold: 0, italic: 1, size: [0.105, 0.135], pos: [0.17, 0.25], words: 2, lines: 2, accent: '#22ee22', pal: ['#22ee22', '#ff2a2a'], text: '#ffffff', outline: 0, upper: true, anim: 'blurpop', mode: 'cycle', soft: true },
  anton:    { label: 'Anton heavy (white, green and red words)', font: 'Anton', fontCyr: 'Oswald Bold', bold: 0, size: [0.1, 0.13], pos: [0.17, 0.25], words: 3, lines: 1, accent: '#22ee22', pal: ['#22ee22', '#ff2a2a'], text: '#ffffff', outline: 0, upper: true, anim: 'blurpop', mode: 'cycle', soft: true },
  orangebox:{ label: 'Orange marker (key word on an orange plate)', font: 'Montserrat Black', bold: 0, size: [0.07, 0.092], pos: [0.17, 0.25], words: 2, lines: 2, accent: '#ff5a14', text: '#ffffff', outline: 1, outW: 0.075, shad: 0.05, upper: true, anim: 'pop', mode: 'marker' },
  // news look: text sits on its own band (the band is applied together with the template and can be edited afterwards)
  news:     { label: 'News 1 (blue broadcast plate, dark text)', font: 'Roboto Black', bold: 0, size: [0.05, 0.062], pos: [0.2, 0.28], words: 3, lines: 1, accent: '#d6121c', text: '#0b1f4d', outline: 0, upper: true, anim: 'fade', mode: 'longest', band: { type: 'image', image: 'builtin_news1', w: 1, aspect: 4.44, auto: false, opacity: 1, radius: 0 } },
  news2:    { label: 'News 2 (red broadcast plate, dark text)', font: 'Roboto Black', bold: 0, size: [0.05, 0.062], pos: [0.2, 0.28], words: 3, lines: 1, accent: '#0b49c4', text: '#1a1a1a', outline: 0, upper: true, anim: 'fade', mode: 'longest', band: { type: 'image', image: 'builtin_news2', w: 1, aspect: 4.44, auto: false, opacity: 1, radius: 0 } },
  // popular creator looks (fast, drawn by ffmpeg)
  hormozi:  { label: 'Hormozi (white caps, yellow word follows the voice)', font: 'Montserrat Black', bold: 0, size: [0.068, 0.09], pos: [0.17, 0.25], words: 3, lines: 2, accent: '#ffe600', text: '#ffffff', outline: 1, outW: 0.09, shad: 0.05, upper: true, anim: 'pop', mode: 'spoken' },
  beast:    { label: 'Beast (huge caps, colours change per line)', font: 'Anton', fontCyr: 'Oswald Bold', bold: 0, size: [0.105, 0.135], pos: [0.17, 0.25], words: 2, lines: 2, accent: '#ffe600', pal: ['#ffe600', '#ff2a2a', '#22ee22'], text: '#ffffff', outline: 1, outW: 0.1, shad: 0.06, upper: true, anim: 'pop', mode: 'linecolor' },
  gamer:    { label: 'Gamer (wide caps, cyan glow)', font: 'Russo One', bold: 0, size: [0.06, 0.08], pos: [0.17, 0.25], words: 3, lines: 2, accent: '#00e5ff', text: '#ffffff', outline: 1, outW: 0.06, upper: true, anim: 'pop', mode: 'longest', glow: true },
  clean:    { label: 'Clean (Inter, soft shadow, yellow key word)', font: 'Inter Bold', bold: 0, size: [0.058, 0.076], pos: [0.15, 0.23], words: 4, lines: 2, accent: '#ffd400', text: '#ffffff', outline: 0, upper: false, anim: 'fade', mode: 'longest', soft: true },
  cinema:   { label: 'Cinema (small, white, thin outline)', font: 'Open Sans Bold', bold: 0, size: [0.04, 0.054], pos: [0.1, 0.17], words: 7, lines: 2, accent: '#ffffff', text: '#ffffff', outline: 1, outW: 0.05, upper: false, anim: 'fade', mode: 'none' },
  redmarker:{ label: 'Red marker (key word on a red plate)', font: 'Montserrat Black', bold: 0, size: [0.07, 0.092], pos: [0.17, 0.25], words: 2, lines: 2, accent: '#e11d2e', text: '#ffffff', outline: 1, outW: 0.075, shad: 0.05, upper: true, anim: 'pop', mode: 'marker' },
  bluemarker:{ label: 'Blue marker (key word on a blue plate)', font: 'Montserrat Black', bold: 0, size: [0.07, 0.092], pos: [0.17, 0.25], words: 2, lines: 2, accent: '#1b5cff', text: '#ffffff', outline: 1, outW: 0.075, shad: 0.05, upper: true, anim: 'pop', mode: 'marker' },
  karayellow:{ label: 'Karaoke yellow (Poppins, word by word)', font: 'Poppins Black', bold: 0, size: [0.066, 0.088], pos: [0.17, 0.25], words: 3, lines: 2, accent: '#ffd400', text: '#ffffff', outline: 1, outW: 0.08, shad: 0.05, upper: false, anim: 'none', mode: 'spoken' },
  bebasbig: { label: 'Bebas big (tall caps, red key word)', font: 'Bebas Neue', fontCyr: 'Oswald Bold', bold: 0, size: [0.115, 0.15], pos: [0.17, 0.25], words: 2, lines: 2, accent: '#ff3b3b', text: '#ffffff', outline: 1, outW: 0.07, shad: 0.04, upper: true, anim: 'pop', mode: 'longest' },
  wide:     { label: 'Wide (Unbounded, orchid key word)', font: 'Unbounded Black', bold: 0, size: [0.05, 0.068], pos: [0.17, 0.25], words: 2, lines: 2, accent: '#ff4fd8', text: '#ffffff', outline: 0, upper: true, anim: 'blurpop', mode: 'longest', soft: true },
  outline:  { label: 'Outline (Archivo, thick black outline)', font: 'Archivo Black', bold: 0, size: [0.07, 0.092], pos: [0.17, 0.25], words: 3, lines: 2, accent: '#ffffff', text: '#ffffff', outline: 1, outW: 0.12, upper: false, anim: 'pop', mode: 'none' },
  pinkpop:  { label: 'Pink pop (Poppins, pink key word)', font: 'Poppins ExtraBold', bold: 0, size: [0.068, 0.09], pos: [0.17, 0.25], words: 2, lines: 2, accent: '#ff4fa3', text: '#ffffff', outline: 0, upper: true, anim: 'blurpop', mode: 'longest', soft: true },
  cyanpop:  { label: 'Cyan pop (Poppins, cyan key word)', font: 'Poppins ExtraBold', bold: 0, size: [0.068, 0.09], pos: [0.17, 0.25], words: 2, lines: 2, accent: '#35c8ff', text: '#ffffff', outline: 0, upper: true, anim: 'blurpop', mode: 'longest', soft: true },
  yellowtxt:{ label: 'Yellow text (Archivo, white key word)', font: 'Archivo Black', bold: 0, size: [0.068, 0.09], pos: [0.17, 0.25], words: 3, lines: 2, accent: '#ffffff', text: '#ffe600', outline: 1, outW: 0.1, shad: 0.05, upper: true, anim: 'pop', mode: 'longest' },
  thin:     { label: 'Thin lowercase (Inter, calm fade)', font: 'Inter Bold', bold: 0, size: [0.05, 0.066], pos: [0.13, 0.21], words: 5, lines: 2, accent: '#ffffff', text: '#ffffff', outline: 0, upper: false, anim: 'fade', mode: 'none', soft: true },
  neon:     { label: 'Neon (green glow)', font: 'Arial', bold: 1, size: [0.064, 0.09], pos: [0.17, 0.26], words: 3, accent: '#39ff14', text: '#ffffff', outline: 1, upper: true, anim: 'pop', mode: 'longest', glow: true }
};

function chunks(words, maxWords, maxChars = 22) {
  const out = []; let cur = [];
  for (const w of words) {
    cur.push(w);
    const len = cur.map(x => x.w).join(' ').length;
    if (cur.length >= maxWords || len > maxChars || /[.,!?;:]$/.test(w.w)) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out;
}

function buildAss(words, W, H, cards = [], opts = {}) {
  const T0 = TEMPLATES[opts.style] || TEMPLATES.classic;
  const cyr = /[Ѐ-ӿͰ-Ͽ]/.test([...(words || []).map(w => w.w), ...(opts.cues || []).map(q => q.text)].join(' '));
  const T = opts.font ? { ...T0, font: opts.font, bold: 0 } : (cyr && T0.fontCyr ? { ...T0, font: T0.fontCyr } : T0);   // Latin-only fonts give way to a Cyrillic / Greek one
  const accent = bgr(opts.accent || T.accent), tcol = bgr(T.text);
  const pal = !opts.accent && T.pal ? T.pal.map(bgr) : [accent];       // colours that rotate from caption to caption
  let cyc = 0;
  const vert = H > W * 1.3, vi = vert ? 1 : 0;
  const sc = opts.capScale > 0 ? opts.capScale : 1;
  const fs = opts.capPx > 0 ? Math.round(opts.capPx) : Math.round(Math.min(W, H) * T.size[vi] * sc), mv = Math.round(H * T.pos[vi]);
  // custom position from the preview editor: caption centre as fraction of the frame
  const posTag = opts.capY != null ? `{\\an5\\pos(${Math.round((opts.capX ?? 0.5) * W)},${Math.round(opts.capY * H)})}` : '';
  const fx = { pop: '{\\fscx88\\fscy88\\t(0,110,\\fscx100\\fscy100)}', blurpop: '{\\fscx86\\fscy86\\blur7\\t(0,170,\\fscx100\\fscy100\\blur1.6)}', fade: '{\\fad(90,60)}', none: '' }[T.anim];
  const conv = s => T.upper ? s.toUpperCase() : s;
  const lines = Math.min(4, Math.max(1, Math.round(opts.capLines) || T.lines || 1));
  // custom cues (edited / imported SRT) replace the automatic grouping; their words are spread evenly over the cue
  const cs = opts.cues && opts.cues.length
    ? opts.cues.map(q => { const ws = q.text.split(/\s+/).filter(Boolean), d = (q.end - q.start) / Math.max(1, ws.length); const a = ws.map((w, k) => ({ w, start: q.start + d * k, end: q.start + d * (k + 1) })); a.hard = true; return a; }).filter(a => a.length)
    : chunks(words, T.words * lines, 22 * lines);
  // split the words of one caption block over `lines` lines (explicit line breaks)
  const lineJoin = arr => { if (lines === 1 || arr.length < 2) return arr.join(' '); const per = Math.ceil(arr.length / Math.min(lines, arr.length)); const o = []; for (let i = 0; i < arr.length; i += per) o.push(arr.slice(i, i + per).join(' ')); return o.join('\\N'); };
  const lineArrs = arr => { if (lines === 1 || arr.length < 2) return [arr]; const per = Math.ceil(arr.length / Math.min(lines, arr.length)); const o = []; for (let i = 0; i < arr.length; i += per) o.push(arr.slice(i, i + per)); return o; };
  const longest = (c, min) => { let ki = -1, al = min; c.forEach((x, k) => { const l = x.w.replace(/[^\p{L}\p{N}]/gu, '').length; if (l > al) { ki = k; al = l; } }); return ki; };
  // plate template: measure every caption line once so the plate fits the text
  let mz = null;
  if (T.mode === 'reveal') { const strs = []; cs.forEach(c => lineArrs(c.map(x => conv(x.w))).forEach(l => strs.push(l.join(' ')))); mz = opts.measure ? opts.measure(T.font, fs, strs) : { line: fs * 1.5, w: s => s.length * fs * 0.6 }; }
  let ev = '';
  cs.forEach((c, i) => {
    const start = c[0].start;
    const nextStart = cs[i + 1] ? cs[i + 1][0].start : c[c.length - 1].end + 0.3;
    const end = c.hard ? c[c.length - 1].end : Math.min(nextStart, c[c.length - 1].end + 0.6);
    // accent colour of the speaker who is talking in this caption (when speaker segments are used)
    const segHere = opts.segments && opts.segments.find(s => c[0].start >= s.start - 0.05 && c[0].start < s.end);
    let accentHere = segHere && segHere.color ? bgr(segHere.color) : accent;
    const nextCol = () => (segHere && segHere.color ? bgr(segHere.color) : pal[cyc++ % pal.length]);
    if (T.pal && !opts.accent) accentHere = pal[0];
    const hi = k => `{\\c&H${accentHere}&}${esc(conv(c[k].w))}{\\c&H${tcol}&}`;
    if (T.mode === 'reveal') {
      // light rounded plate that fits the text; the words turn dark one by one as they are spoken
      const ls = lineArrs(c.map(x => esc(conv(x.w)))), strs = ls.map(l => l.join(' '));
      const padX = Math.round(fs * 0.55), padY = Math.round(fs * 0.2), r = Math.round(fs * 0.3);
      const bw = Math.round(Math.max(...strs.map(s => mz.w(s))) + 2 * padX), bh = Math.round(ls.length * mz.line + 2 * padY);
      const cx = Math.round((opts.capX ?? 0.5) * W), cy = Math.round(opts.capY != null ? opts.capY * H : H - mv - bh / 2);
      const shape = `m ${r} 0 l ${bw - r} 0 b ${bw} 0 ${bw} 0 ${bw} ${r} l ${bw} ${bh - r} b ${bw} ${bh} ${bw} ${bh} ${bw - r} ${bh} l ${r} ${bh} b 0 ${bh} 0 ${bh} 0 ${bh - r} l 0 ${r} b 0 0 0 0 ${r} 0`;
      ev += `Dialogue: 0,${fmt(start)},${fmt(end)},Plate,,0,0,0,,{\\an7\\pos(${cx - Math.round(bw / 2)},${cy - Math.round(bh / 2)})\\fad(70,60)\\p1}${shape}{\\p0}\n`;
      c.forEach((_, k) => {
        const s = k === 0 ? start : c[k].start, e = k + 1 < c.length ? c[k + 1].start : end;
        let idx = 0;
        const t = ls.map(l => l.map(w => `{\\c&H${idx++ <= k ? tcol : accent}&}${w}`).join(' ')).join('\\N');
        ev += `Dialogue: 1,${fmt(s)},${fmt(e)},Cap,,0,0,0,,{\\an5\\pos(${cx},${cy})}${t}\n`;
      });
      return;
    }
    if (T.mode === 'marker') {
      // the key word sits on an orange marker plate behind white text
      const ki = longest(c, 3), pf = '{\\fscx88\\fscy88\\t(0,110,\\fscx100\\fscy100)}';
      if (ki >= 0) ev += `Dialogue: 0,${fmt(start)},${fmt(end)},Box,,0,0,0,,${pf}{\\alpha&HFF&}${lineJoin(c.map((x, k) => k === ki ? `{\\alpha&H00&}${esc(conv(x.w))}{\\alpha&HFF&}` : esc(conv(x.w))))}\n`;
      ev += `Dialogue: 1,${fmt(start)},${fmt(end)},Cap,,0,0,0,,${pf}${lineJoin(c.map(x => esc(conv(x.w))))}\n`;
      return;
    }
    if (T.mode === 'linecolor') {
      const ls = lineArrs(c.map(x => esc(conv(x.w)))), col = nextCol();
      ev += `Dialogue: 0,${fmt(start)},${fmt(end)},Cap,,0,0,0,,${fx}${ls.map((l, li) => li === 0 ? `{\\c&H${col}&}${l.join(' ')}{\\c&H${tcol}&}` : l.join(' ')).join('\\N')}\n`;
      return;
    }
    if (T.mode === 'cyclekey' || T.mode === 'cycle') {
      const ki = longest(c, T.mode === 'cycle' ? 6 : 3);
      const col = ki >= 0 ? nextCol() : tcol;
      ev += `Dialogue: 0,${fmt(start)},${fmt(end)},Cap,,0,0,0,,${fx}${lineJoin(c.map((x, k) => k === ki ? `{\\c&H${col}&}${esc(conv(x.w))}{\\c&H${tcol}&}` : esc(conv(x.w))))}\n`;
      return;
    }
    if (T.mode === 'spoken') {
      c.forEach((_, k) => {
        const s = c[k].start, e = k + 1 < c.length ? c[k + 1].start : end;
        const text = lineJoin(c.map((x, j) => j === k ? hi(j) : esc(conv(x.w))));
        ev += `Dialogue: 0,${fmt(s)},${fmt(e)},Cap,,0,0,0,,${k === 0 ? fx : ''}${text}\n`;
      });
      return;
    }
    if (T.mode === 'labelkey') {
      // small lead-in words on the first line, the key word big and coloured below
      let ki = c.length - 1, al = 0; c.forEach((x, k) => { const l = x.w.replace(/[^\p{L}\p{N}]/gu, '').length; if (l >= al && l >= 4) { ki = k; al = l; } });
      const small = Math.round(fs * 0.56), lead = c.slice(0, ki).map(x => esc(conv(x.w))).join(' '), tail = c.slice(ki + 1).map(x => esc(conv(x.w))).join(' ');
      const big = hi(ki) + (tail ? ' ' + tail : '');
      ev += `Dialogue: 0,${fmt(start)},${fmt(end)},Cap,,0,0,0,,${fx}${lead ? `{\\fs${small}}${lead}{\\fs${fs}}\\N` : ''}${big}\n`;
      return;
    }
    let ai = -1;
    if (T.mode === 'numkey' && c.some(x => /[0-9€$£%]/.test(x.w))) {
      const text = lineJoin(c.map((x, k) => /[0-9€$£%]/.test(x.w) ? hi(k) : esc(conv(x.w))));
      ev += `Dialogue: 0,${fmt(start)},${fmt(end)},Cap,,0,0,0,,${fx}${text}\n`;
      return;
    }
    if (T.mode === 'longest' || T.mode === 'numkey') { let al = 4; c.forEach((x, k) => { const l = x.w.replace(/[^\p{L}\p{N}]/gu, '').length; if (l > al) { ai = k; al = l; } }); }
    const text = lineJoin(c.map((x, k) => k === ai ? hi(k) : esc(conv(x.w))));
    ev += `Dialogue: 0,${fmt(start)},${fmt(end)},Cap,,0,0,0,,${fx}${text}\n`;
  });

  const cfs = Math.round(Math.min(W, H) * (vert ? 0.075 : 0.07)), cmv = Math.round(H * (vert ? 0.09 : 0.1));
  const pop = '{\\fscx72\\fscy72\\fad(120,150)\\t(0,200,\\fscx100\\fscy100)}';
  // speaker name tags: small label (lower-left) for 2.6 s at the start of a segment
  (opts.segments || []).forEach(s => { if (s.tag) ev += `Dialogue: 2,${fmt(s.start + 0.3)},${fmt(Math.min(s.end, s.start + 2.9))},Tag,,0,0,0,,{\\fad(150,200)}${esc(s.tag)}\n`; });
  cards.forEach(c => { ev += `Dialogue: 1,${fmt(c.start)},${fmt(c.end)},${c.variant ? 'Card2' : 'Card'},,0,0,0,,${pop}{\\fs${Math.min(cfs, Math.floor(W * 0.78 / (Math.max(6, c.text.length) * 0.68)))}}${esc(c.text)}\n`; });

  // news clock: the time runs on from the start time (a new event every minute, or every second)
  if (opts.clock) {
    const c = opts.clock, dur = opts.duration || 60, p2 = n => String(n).padStart(2, '0');
    const show = s => { s = ((s % 86400) + 86400) % 86400; return p2(Math.floor(s / 3600)) + ':' + p2(Math.floor(s % 3600 / 60)) + (c.seconds ? ':' + p2(s % 60) : ''); };
    for (let t = 0; t < dur;) { const abs = c.start + Math.floor(t), end = Math.min(dur, t + (c.seconds ? 1 : 60 - (abs % 60)));
      ev += 'Dialogue: 4,' + fmt(t) + ',' + fmt(end) + ',Clock,,0,0,0,,{' + String.fromCharCode(92) + 'an5' + String.fromCharCode(92) + 'pos(' + c.cx + ',' + c.cy + ')}' + (c.label ? esc(c.label) + ' ' : '') + show(abs) + String.fromCharCode(10); t = end; }
  }
  const outline = T.box ? Math.round(fs * 0.22) : (T.outline ? Math.max(3, T.outW ? Math.round(fs * T.outW) : Math.round(fs / 11)) : 0);
  const shadow = T.shad ? Math.max(2, Math.round(fs * T.shad)) : T.soft ? Math.max(2, Math.round(fs / 13)) : (T.glow ? 0 : 1);
  const plateCol = bgr(T.plateCol || '#e9e7ea'), boxCol = bgr(opts.accent || T.accent), boxPad = Math.round(fs * 0.14);
  const customPos = T.mode === 'reveal' ? '' : posTag;           // the plate template places itself
  const border = T.box ? 3 : 1, outCol = T.box ? '&HB0000000' : '&H00000000';
  const glow = T.glow ? `{\\blur2}` : T.soft ? `{\\blur1.6}` : '';
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Cap,${T.font},${fs},&H00${tcol},&H00${tcol},${outCol},${T.soft ? '&H8C000000' : '&H80000000'},${T.bold},${T.italic ? -1 : 0},0,0,100,100,0,0,${border},${outline},${shadow},2,40,40,${mv},1
Style: Plate,Arial,${fs},&H00${plateCol},&H00${plateCol},&H00${plateCol},&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
${opts.clock ? `Style: Clock,${opts.clock.font},${opts.clock.fs},&H00${bgr(opts.clock.color)},&H00${bgr(opts.clock.color)},&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1
` : ''}Style: Box,${T.font},${fs},&H00${boxCol},&H00${boxCol},&H00${boxCol},&H00000000,${T.bold},0,0,0,100,100,0,0,3,${boxPad},0,2,40,40,${mv},1
Style: Card,Arial,${cfs},&H00FFFFFF,&H00FFFFFF,&H000000E0,&H80000000,1,0,0,0,100,100,2,0,3,${Math.round(cfs * 0.28)},0,8,40,40,${cmv},1
Style: Tag,Arial,${Math.round(Math.min(W, H) * (vert ? 0.05 : 0.04))},&H00FFFFFF,&H00FFFFFF,&HB0000000,&H80000000,1,0,0,0,100,100,0,0,3,${Math.round(W * 0.012)},0,1,${Math.round(W * 0.05)},40,${Math.round(H * (vert ? 0.34 : 0.1))},1
Style: Card2,Arial,${cfs},&H0000E0FF,&H0000E0FF,&H00181818,&H80000000,1,0,0,0,100,100,2,0,3,${Math.round(cfs * 0.28)},0,8,40,40,${cmv},1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
${(glow || customPos) ? ev.replace(/(Cap|Box),,0,0,0,,/g, (m, st) => st + ',,0,0,0,,' + customPos + (st === 'Cap' ? glow : '')) : ev}`;
}
// The automatic caption grouping as editable cues [{start,end,text}] (same grouping that is burned in when no custom cues exist).
function autoCues(words, opts = {}) {
  const T = TEMPLATES[opts.style] || TEMPLATES.classic;
  const lines = Math.min(4, Math.max(1, Math.round(opts.capLines) || T.lines || 1));
  const cs = chunks(words, T.words * lines, 22 * lines);
  return cs.map((c, i) => {
    const nextStart = cs[i + 1] ? cs[i + 1][0].start : c[c.length - 1].end + 0.3;
    const text = c.map(x => x.w).join(' ');
    return { start: +c[0].start.toFixed(3), end: +Math.min(nextStart, c[c.length - 1].end + 0.6).toFixed(3), text: T.upper ? text : text };
  });
}
// where the caption block sits: font size, horizontal centre and top/bottom edge in pixels (used to place emoji above it)
function geometry(W, H, opts = {}) {
  const T = TEMPLATES[opts.style] || TEMPLATES.classic, vi = H > W * 1.3 ? 1 : 0, sc = opts.capScale > 0 ? opts.capScale : 1;
  const fs = opts.capPx > 0 ? Math.round(opts.capPx) : Math.round(Math.min(W, H) * T.size[vi] * sc);
  const lines = Math.min(4, Math.max(1, Math.round(opts.capLines) || T.lines || 1));
  const extra = T.mode === 'labelkey' ? fs * 0.65 : 0;                     // the small lead-in line above the big word
  if (opts.capY != null) { const cy = opts.capY * H; return { fs, lines, cx: (opts.capX ?? 0.5) * W, top: cy - lines * fs * 0.58 - extra / 2, bottom: cy + lines * fs * 0.58 }; }
  const bottom = H - Math.round(H * T.pos[vi]);
  return { fs, lines, cx: W / 2, top: bottom - lines * fs * 1.15 - extra, bottom };
}
module.exports = { buildAss, autoCues, geometry, TEMPLATES };
