// SRT export / import for caption cues: [{ start, end, text }] (seconds).
const pad = (n, l = 2) => String(n).padStart(l, '0');
function tc(t) {
  t = Math.max(0, t);
  const ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}
const toSrt = cues => cues.map((c, i) => `${i + 1}\n${tc(c.start)} --> ${tc(c.end)}\n${c.text}\n`).join('\n');

function parseTime(s) {
  const m = s.trim().match(/^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})$/) || s.trim().match(/^(\d{1,2}):(\d{2})[,.](\d{1,3})$/);
  if (!m) return NaN;
  if (m.length === 5) return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, '0') / 1000;
  return +m[1] * 60 + +m[2] + +m[3].padEnd(3, '0') / 1000;
}
function parseSrt(text) {
  const cues = [];
  const blocks = text.replace(/^﻿/, '').replace(/\r/g, '').split(/\n\s*\n/);
  for (const b of blocks) {
    const lines = b.split('\n').map(l => l.trim()).filter(l => l !== '');
    const ti = lines.findIndex(l => l.includes('-->'));
    if (ti < 0) continue;
    const [a, z] = lines[ti].split('-->');
    const start = parseTime(a), end = parseTime(z.trim().split(/\s+/)[0]);
    const body = lines.slice(ti + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').trim();
    if (isNaN(start) || isNaN(end) || end <= start || !body) continue;
    cues.push({ start: +start.toFixed(3), end: +end.toFixed(3), text: body });
  }
  return cues.sort((x, y) => x.start - y.start);
}
module.exports = { toSrt, parseSrt, tc };
