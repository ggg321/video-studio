// Script parsing, claim linting, alignment with transcript.
const norm = w => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');

// A line that starts with "Speaker 1:", "Спикер 2:", "Відгук:" or the name of a person from the Speakers page says who talks. The label is not spoken.
const LABEL = /^(спикер|speaker|говорящий|ведучий|ведущий|диктор|голос|клиент(?:ка)?|клієнт(?:ка)?|отзыв|відгук|review|гость|гість|эксперт|експерт|врач|лікар|доктор|интервьюер|інтерв'юер)\s*[#№]?\s*\d*$/i;
const labelNorm = s => String(s || '').toLowerCase().replace(/[#№]/g, '').replace(/\s+/g, ' ').trim();
const speakerNames = () => { try { return require('./speakers').list().map(s => labelNorm(s.name)).filter(Boolean); } catch { return []; } };
function parseBlocksEx(text, names) {
  names = names || speakerNames();
  const isLabel = s => { const n = labelNorm(s); return n.length > 0 && n.length <= 40 && (LABEL.test(n) || names.includes(n)); };
  const raw = text.replace(/\r/g, '').split(/\n\s*\n|\n(?=\s*\d+\.\s)/).map(s => s.trim()).filter(Boolean);
  const out = []; let cur = '';
  for (const b of raw) {
    // a paragraph can hold several turns: every line that starts with a label starts a new block
    const turns = []; let acc = null;
    for (const line of b.split('\n')) {
      const m = line.match(/^\s*([^:：\n]{1,40}?)\s*[:：]\s*(.*)$/);
      if (m && isLabel(m[1])) { if (acc) turns.push(acc); acc = { label: labelNorm(m[1]), text: m[2] }; }
      else if (acc) acc.text += '\n' + line; else acc = { label: null, text: line };
    }
    if (acc) turns.push(acc);
    for (const tr of turns) {
      if (tr.label) cur = tr.label;
      let t = tr.text.replace(/\n+/g, ' ').replace(/\[[^\]]*\]/g, '').replace(/^\s*\d+[.)]\s*/, '');
      // drop a leading non-latin label like "Хук" or «Возьми ручку»
      // (only a short note in front of a script in another alphabet: a script that is itself Cyrillic keeps all its words)
      const mm = t.match(/^((?:[«"]?[^\s]*[Ѐ-ӿ][^\s]*[»"]?)\s+)+/);
      if (mm) { const pre = mm[0], rest = t.slice(pre.length); if (pre.trim().split(/\s+/).length <= 4 && !/[.!?,;:]/.test(pre) && /^[A-Za-z0-9]/.test(rest)) t = rest.trim(); }
      t = t.replace(/\s+/g, ' ').trim();
      if (t) out.push({ text: t, label: cur });
    }
  }
  return out;
}
function parseBlocks(text) { return parseBlocksEx(text).map(b => b.text); }

function splitSentences(t) {
  return (t.match(/[^.!?]+[.!?]*/g) || [t]).map(s => s.trim()).filter(Boolean);
}

// claim checker removed on request (lib/lint_rules.js is kept but unused)
const lint = () => [];

// Align script words to transcript words (LCS on normalized words), interpolate the rest.
function align(blocks, tWords) {
  const sw = [];
  blocks.forEach((b, bi) => splitSentences(b).forEach((s, si) =>
    s.split(/\s+/).forEach(w => { const n = norm(w); if (n) sw.push({ w, n, block: bi, sent: si }); })));
  const tn = tWords.map(x => norm(x.text));
  const S = sw.length, T = tn.length;
  const eq = (a, b) => a === b || (a.length > 4 && b.length > 4 && (a.startsWith(b.slice(0, 5)) || b.startsWith(a.slice(0, 5))) && Math.abs(a.length - b.length) <= 3);
  const dp = Array.from({ length: S + 1 }, () => new Uint16Array(T + 1));
  for (let i = S - 1; i >= 0; i--) for (let j = T - 1; j >= 0; j--)
    dp[i][j] = eq(sw[i].n, tn[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0, matched = 0;
  while (i < S && j < T) {
    if (eq(sw[i].n, tn[j])) { sw[i].start = tWords[j].start; sw[i].end = tWords[j].end; i++; j++; matched++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  const total = tWords.length ? tWords[T - 1].end : 0;
  let prevEnd = tWords.length ? tWords[0].start : 0;
  for (let k = 0; k < S; k++) {
    if (sw[k].start !== undefined) { prevEnd = sw[k].end; continue; }
    let n = k; while (n < S && sw[n].start === undefined) n++;
    const nextStart = n < S ? sw[n].start : total;
    const cnt = n - k, step = Math.max(0, (nextStart - prevEnd) / cnt);
    for (let m = 0; m < cnt; m++) { sw[k + m].start = prevEnd + step * m; sw[k + m].end = prevEnd + step * (m + 1); }
    k = n - 1; prevEnd = nextStart;
  }
  return { words: sw, total, matchRatio: S ? matched / S : 0 };
}

module.exports = { norm, parseBlocks, parseBlocksEx, splitSentences, lint, align };
