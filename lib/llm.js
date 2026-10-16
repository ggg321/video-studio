// Optional local language model (Ollama) for plan review: hook rewrites, mismatches, editing tips. Nothing leaves this computer.
const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const MODEL = process.env.REVIEW_MODEL || 'gemma3:4b';
const LANGS = { ru: 'Russian', uk: 'Ukrainian', en: 'English' };

async function installed() {
  try {
    const r = await fetch(OLLAMA + '/api/tags', { signal: AbortSignal.timeout(2000) }), j = await r.json();
    return (j.models || []).some(m => m.name === MODEL || m.name === MODEL + ':latest');
  } catch { return false; }
}
const clean = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

// describes what is on screen at each sentence, in plain words
function describe(p, niche) {
  const items = (niche && niche.items) || [];
  return (p.sentences || []).slice(0, 45).map((s, i) => {
    const c = (p.cuts || []).find(x => x.start < s.end - 0.2 && x.end > s.start + 0.2);
    let vis = 'speaker only';
    if (c) {
      if (c.clip === 'card') vis = `text card “${clean(c.card, 40)}”`;
      else if (c.clip === 'stock') vis = `stock video (${clean(c.src || '', 30)})`;
      else { const it = items.find(x => x.id === c.clip); vis = `library clip about: ${clean(((it && it.tags) || []).slice(0, 6).join(', '), 80) || c.clip}${c.sim != null ? ` (match ${Math.round(c.sim * 100)}%)` : ''}`; }
    }
    return `${i + 1}. [${s.start.toFixed(1)}s] “${clean(s.text, 150)}” → ${vis}`;
  }).join('\n');
}

async function reviewPlan(p, niche, rules, uiLang = 'en') {
  const lang = LANGS[uiLang] || 'English';
  const sys = 'You are an experienced editor of short vertical social videos. You review an edit plan and give short, concrete, honest advice. Never invent facts and never add medical or financial promises. Reply with JSON only.';
  const user = `Edit plan of a ${Math.round(p.duration || 0)}-second video. Each line is one spoken sentence and what is shown while it is spoken.\n\n${describe(p, niche)}\n\nAutomatic checks already found: ${rules.issues.slice(0, 5).map(i => i.title).join('; ') || 'nothing special'}. The hook (opening line) scored ${rules.hook ? rules.hook.score : '?'}/100.\n\nReturn JSON with exactly these keys:\n{"hook":{"verdict":"one short sentence about the opening line","alternatives":["stronger opening line 1","stronger opening line 2"]},"mismatches":[{"n":sentence number,"why":"why the picture does not fit","better_visual":"what to show instead"}],"tips":["concrete editing tip 1","tip 2","tip 3"]}\nRules: write verdict, why, better_visual and tips in ${lang}. Write the hook alternatives in the SAME language as the script sentences, keep the same facts, 12 words or fewer each. Report a mismatch ONLY for a sentence whose picture is a text card or a library clip with a match below 60%, or whose clip topic clearly contradicts the words; otherwise return an empty list. Do not repeat the automatic checks. Each of the 3 tips must be specific: mention a sentence number or a time in seconds, and say exactly what to change.`;
  const t0 = Date.now();
  const ask = async temp => (await fetch(OLLAMA + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(300000), body: JSON.stringify({ model: MODEL, stream: false, format: 'json', keep_alive: '5m', options: { temperature: temp, num_ctx: 4096, num_predict: 900, repeat_penalty: 1.15 }, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }) })).json();
  let j = await ask(0.3);
  if (j.error) j = await ask(0.6);                      // a repetition loop is rare; one retry with a bit more variety
  if (j.error) throw new Error(j.error);
  let o; try { o = JSON.parse(j.message.content); } catch { throw new Error('The model did not return valid JSON. Try again.'); }
  const sents = p.sentences || [];
  const out = {
    hook: { verdict: clean(o.hook && o.hook.verdict, 300), alternatives: ((o.hook && o.hook.alternatives) || []).map(x => clean(x, 160)).filter(Boolean).slice(0, 2) },
    mismatches: (Array.isArray(o.mismatches) ? o.mismatches : []).map(m => { const s = sents[(+m.n || 0) - 1]; return s ? { n: +m.n, at: s.start, text: clean(s.text, 90), why: clean(m.why, 220), better: clean(m.better_visual, 220) } : null; }).filter(Boolean).slice(0, 4),
    tips: (Array.isArray(o.tips) ? o.tips : []).map(x => clean(x, 260)).filter(x => x.length >= 25).slice(0, 3)
  };
  return { model: MODEL, lang: uiLang, ms: Date.now() - t0, at: Date.now(), ...out };
}
module.exports = { installed, reviewPlan, MODEL };
