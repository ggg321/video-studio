// Plan review without any neural network: scores the hook (first seconds), checks pacing, matches, repeats and gaps,
// and writes concrete editing tips. Pure rules; word lists cover the app's main languages (en ru uk nl de fr es pt it pl).
const norm = s => String(s).toLowerCase().normalize('NFC');
const words = s => (norm(s).match(/[\p{L}\p{N}'’€$%.,-]+/gu) || []).map(w => w.replace(/^[.,'’-]+|[.,'’-]+$/g, '')).filter(Boolean);

// direct address ("you")
const ADDRESS = new Set(['you', 'your', "you're", 'ты', 'тебя', 'тебе', 'вы', 'вас', 'вам', 'ваш', 'ваша', 'ваши', 'ваше', 'твой', 'твоя', 'ти', 'тебе', 'ви', 'вас', 'вам', 'ваш', 'je', 'jij', 'jouw', 'u', 'uw', 'jullie', 'du', 'dich', 'dir', 'dein', 'deine', 'sie', 'ihnen', 'ihr', 'tu', 'te', 'ton', 'ta', 'vous', 'votre', 'vos', 'tú', 'usted', 'ustedes', 'tu', 'tus', 'você', 'vocês', 'seu', 'sua', 'voi', 'ti', 'tuo', 'tua', 'wy', 'ty', 'twój', 'twoja', 'państwo']);
// curiosity / strong words (prefix match)
const STRONG = ['secret', 'never', 'stop', 'mistake', 'truth', 'why', 'how ', 'shock', 'free', 'only', 'new ', 'banned', 'worst', 'best', 'fast', 'easy', 'simple', 'real', 'proof', 'warning', 'danger', 'finally', 'without', 'this one', 'nobody', 'everyone', 'секрет', 'никогда', 'ошибк', 'правд', 'почему', 'как ', 'шок', 'бесплатн', 'только', 'нов', 'худш', 'лучш', 'быстр', 'прост', 'вот почему', 'никто', 'все ', 'опасн', 'внимани', 'нарешті', 'ніколи', 'помилк', 'правд', 'чому', 'безкоштовн', 'лише', 'нов', 'найгірш', 'найкращ', 'швидк', 'просто', 'ніхто', 'небезпек', 'geheim', 'nooit', 'fout', 'waarom', 'gratis', 'alleen', 'nieuw', 'snel', 'makkelijk', 'niemand', 'gevaar', 'immer', 'nie ', 'fehler', 'wahrheit', 'warum', 'kostenlos', 'nur ', 'neu ', 'schnell', 'einfach', 'niemand', 'gefahr', 'secret', 'jamais', 'erreur', 'vérité', 'pourquoi', 'gratuit', 'seulement', 'nouveau', 'rapide', 'facile', 'personne', 'danger', 'secreto', 'nunca', 'error', 'verdad', 'por qué', 'gratis', 'solo ', 'nuevo', 'rápido', 'fácil', 'nadie', 'peligro', 'segredo', 'nunca', 'erro', 'verdade', 'por que', 'grátis', 'só ', 'novo', 'rápido', 'fácil', 'ninguém', 'perigo', 'segreto', 'mai ', 'errore', 'verità', 'perché', 'gratis', 'solo ', 'nuovo', 'veloce', 'facile', 'nessuno', 'pericolo', 'sekret', 'nigdy', 'błąd', 'prawda', 'dlaczego', 'darmow', 'tylko', 'nowy', 'szybk', 'łatwo', 'nikt', 'niebezpiecz'];
const FILLER = /^(hello|hi|hey|welcome|good (morning|evening|day)|so|well|ok|okay|привет|здравствуйте|добрый|итак|ну|так|вітаю|привіт|доброго|отже|hallo|hoi|welkom|goedemorgen|hallo|willkommen|guten|also|bonjour|salut|bienvenue|hola|bienvenidos|buenos|olá|bem-vindo|bom dia|ciao|benvenuti|buongiorno|cześć|witajcie|dzień dobry)\b/;
const NUM = /[0-9€$£%]/;
const EMPH = /[0-9€$£%]|\b(never|always|every|all|only|zero|double|triple|million|billion|free|guarantee\w*|никогда|всегда|каждый|все|только|ноль|миллион|бесплатно|гарантия|ніколи|завжди|кожен|тільки|гарантія)\b/i;
const CTA = /(subscribe|follow|link|click|sign up|download|register|подпиш|ссылк|перейд|скачай|регистр|підпиш|посилан|перейди|завантаж|abonneer|volg|klik|abonnieren|folgen|klicken|abonnez|suivez|cliquez|suscr|sigue|haz clic|inscreva|siga|clique|iscriv|segui|clicca|subskryb|obserwuj|kliknij)/i;

function scoreHook(text) {
  const t = String(text).trim(), w = words(t), first = w.slice(0, 14), low = norm(t);
  const reasons = []; let s = 40;
  const add = (pts, ok, good, bad) => { if (ok) { s += pts; reasons.push({ ok: true, text: good }); } else if (bad) reasons.push({ ok: false, text: bad }); };
  const len = w.length;
  if (len <= 12) { s += 15; reasons.push({ ok: true, text: 'Short and quick to take in' }); } else if (len <= 20) { s += 5; reasons.push({ ok: false, text: 'A little long: shorter hooks hold better' }); } else { s -= 10; reasons.push({ ok: false, text: 'Too long for a hook: it needs a punchier first line' }); }
  add(20, /[?？]/.test(t), 'Asks a question', 'No question: a question creates curiosity');
  add(15, first.some(x => ADDRESS.has(x)), 'Speaks to the viewer directly', 'Does not address the viewer (“you”)');
  add(12, NUM.test(first.join(' ')), 'Contains a number or amount', 'No number or concrete fact');
  add(15, STRONG.some(k => low.slice(0, 120).includes(k)), 'Uses a strong or curiosity word', 'No strong word (secret, never, why, mistake…)');
  if (FILLER.test(low)) { s -= 20; reasons.push({ ok: false, text: 'Starts with a greeting or filler: viewers scroll away' }); }
  return { score: Math.max(0, Math.min(100, Math.round(s))), reasons };
}

function review(p) {
  const out = { hook: null, issues: [], stats: {}, score: 0 }, cuts = p.cuts || [], sents = p.sentences || [], dur = p.duration || (p.words && p.words.length ? p.words[p.words.length - 1].end : 0);
  const issue = (level, title, detail, extra = {}) => out.issues.push({ level, title, detail, ...extra });
  const clips = cuts.map((c, i) => ({ ...c, i })).filter(c => c.clip && c.clip !== 'card');
  const cards = cuts.map((c, i) => ({ ...c, i })).filter(c => c.clip === 'card');
  const hasPresenter = !!p.presenterFile;

  // ---- hook ----
  if (sents.length) {
    const h = scoreHook(sents[0].text), first = cuts.find(c => c.start < 2);
    out.hook = { score: h.score, text: sents[0].text, reasons: h.reasons, label: h.score >= 75 ? 'strong' : h.score >= 55 ? 'ok' : 'weak', better: [] };
    if (!first && !hasPresenter) out.hook.reasons.push({ ok: false, text: 'No picture in the first seconds' });
    else if (first) out.hook.reasons.push({ ok: true, text: 'A cut or insert lands in the first 2 seconds' });
    out.hook.better = sents.slice(1, 12).map(x => ({ text: x.text, score: scoreHook(x.text).score, at: x.start })).filter(x => x.score >= h.score + 15).sort((a, b) => b.score - a.score).slice(0, 2);
    if (h.score < 55) issue('warn', 'The first line is a weak hook', out.hook.better.length ? 'A stronger line is later in the script: consider opening with it.' : 'Try opening with a question, a number or a direct address to the viewer.', { at: 0 });
  }

  // ---- inserts: length, flicker ----
  const lens = clips.map(c => c.end - c.start), avg = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  const shortOnes = clips.filter(c => c.end - c.start < 1.0);
  if (shortOnes.length >= 2) issue('warn', `${shortOnes.length} very short inserts (under 1 s)`, 'Inserts this short flicker. Lengthen them or merge neighbours.', { at: shortOnes[0].start, cut: shortOnes[0].i });
  const longOnes = clips.filter(c => c.end - c.start > 7);
  if (longOnes.length) issue('tip', `${longOnes.length} insert(s) longer than 7 s`, 'A long shot with no change loses attention. Split it or add a zoom.', { at: longOnes[0].start, cut: longOnes[0].i });

  // ---- pacing with a presenter: long stretches without any change ----
  if (hasPresenter && dur) {
    const marks = [0, ...cuts.map(c => c.start), ...cuts.map(c => c.end), ...(p.zooms || []).map(z => z.start), dur].sort((a, b) => a - b);
    let best = { gap: 0, at: 0 }; for (let i = 1; i < marks.length; i++) if (marks[i] - marks[i - 1] > best.gap) best = { gap: marks[i] - marks[i - 1], at: marks[i - 1] };
    if (best.gap > 7) issue('warn', `${Math.round(best.gap)} s with no change on screen`, 'Add an insert, a text card or a zoom in this stretch to keep the viewer watching.', { at: best.at, zoomAt: best.at + Math.min(best.gap / 2, 3) });
  }

  // ---- how well the inserts fit ----
  const withSim = clips.filter(c => c.sim != null);
  const weak = withSim.filter(c => c.sim < 0.55 && c.clip !== 'stock');
  if (cards.length) issue(cards.length >= 4 ? 'warn' : 'tip', `${cards.length} moment(s) show a text card instead of a clip`, 'Replace them with stock video (the “Cards → stock video” button) or add clips about these topics.', { at: cards[0].start, cut: cards[0].i, action: 'stock', list: cards.slice(0, 4).map(c => c.card || c.text) });
  if (weak.length) issue('warn', `${weak.length} insert(s) fit the words only loosely`, 'Check these moments and swap the clip if it is off-topic.', { at: weak[0].start, cut: weak[0].i, list: weak.slice(0, 4).map(c => c.text) });
  if (!withSim.length && clips.length && !p.semantic) issue('tip', 'Matching by meaning was off', 'Inserts were matched by keywords only. Matching by meaning (AI, local) usually fits better.', {});

  // ---- repeats ----
  const by = {}; clips.forEach(c => { if (c.clip !== 'stock') (by[c.clip] = by[c.clip] || []).push(c); });
  const rep = Object.entries(by).filter(([, l]) => l.length >= 3);
  if (rep.length) issue('warn', `${rep.length} clip(s) used 3 times or more`, 'Repeats make the video feel cheap. Swap some of them for other clips.', { at: rep[0][1][1].start, cut: rep[0][1][1].i });
  const close = clips.filter((c, i) => i && clips[i - 1].clip === c.clip && c.clip !== 'stock');
  if (close.length) issue('bad', 'The same clip appears twice in a row', 'Swap one of them.', { at: close[0].start, cut: close[0].i });

  // ---- strong phrases without a visual accent ----
  const accents = sents.filter(x => EMPH.test(x.text) && x.end - x.start > 1.2 && !(p.zooms || []).some(z => Math.abs(z.start - x.start) < 1.5) && !cards.some(c => Math.abs(c.start - x.start) < 1.5)).slice(0, 3);
  accents.forEach(x => issue('tip', 'Strong phrase without an accent', `“${x.text.slice(0, 70)}”: a punch zoom or a coloured number would make it land.`, { at: x.start, zoomAt: x.start }));

  // ---- call to action ----
  if (sents.length > 3 && !CTA.test(sents.slice(-2).map(s => s.text).join(' '))) issue('tip', 'No call to action at the end', 'Ending with what the viewer should do next (follow, click, sign up) usually increases results.', { at: sents[sents.length - 1].start });

  // ---- length ----
  if (dur > 75) issue('tip', `The video is ${Math.floor(dur / 60)}:${String(Math.round(dur % 60)).padStart(2, '0')} long`, 'Short-video feeds reward videos under about a minute. Tighten the script if the platform allows nothing longer.', {});

  const bad = out.issues.filter(i => i.level === 'bad').length, warn = out.issues.filter(i => i.level === 'warn').length;
  const plan = Math.max(0, 100 - bad * 18 - warn * 8 - (cards.length > 0 ? 3 : 0));
  out.stats = { duration: +dur.toFixed(1), inserts: clips.length, cards: cards.length, avgInsert: +avg.toFixed(1), perMinute: dur ? +(cuts.length / dur * 60).toFixed(0) : 0, weak: weak.length, semantic: !!p.semantic };
  out.plan = plan; out.score = Math.round((out.hook ? out.hook.score * 0.35 : 50 * 0.35) + plan * 0.65);
  const rank = { bad: 0, warn: 1, tip: 2 }; out.issues.sort((a, b) => rank[a.level] - rank[b.level]);
  return out;
}
module.exports = { review, scoreHook };
