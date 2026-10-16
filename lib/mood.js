// Suggests background music for a script: keyword moods (en / ru / uk) + speaking pace + a small niche prior. Rules only, nothing leaves the computer.
const BEDS = {
  bed_calm: { mood: 'calm and soothing', kw: ['relax', 'calm', 'sleep', 'stress', 'breath', 'meditat', 'peace', 'slow', 'rest', 'anxiety', 'расслаб', 'спокой', 'сон', 'стресс', 'дыхан', 'медитац', 'отдых', 'тревог', 'розслаб', 'спокій', 'стрес', 'дихан', 'відпочин', 'тривог'], pace: -1 },
  bed_pulse: { mood: 'energetic, steady', kw: ['fast', 'quick', 'energy', 'today', 'step', 'tip', 'trick', 'быстр', 'энерги', 'сегодня', 'шаг', 'совет', 'трюк', 'швидк', 'енерг', 'сьогодні', 'крок', 'порад'], pace: 1 },
  bed_drive: { mood: 'driving, action', kw: ['workout', 'train', 'run', 'fight', 'push', 'power', 'win', 'game', 'match', 'goal', 'speed', 'тренир', 'бег', 'бой', 'сил', 'побед', 'игр', 'матч', 'гол', 'скорост', 'тренув', 'біг', 'бій', 'перемог', 'гра', 'швидкіст'], pace: 1 },
  bed_chill: { mood: 'relaxed everyday', kw: ['daily', 'morning', 'evening', 'habit', 'routine', 'easy', 'simple', 'walk', 'coffee', 'water', 'lemon', 'ежедневн', 'утр', 'вечер', 'привычк', 'просто', 'легко', 'прогулк', 'кофе', 'вод', 'лимон', 'щодня', 'ранок', 'ранк', 'вечір', 'звичк', 'легко', 'прогулянк', 'кава'], pace: -1 },
  bed_uplift: { mood: 'positive, uplifting', kw: ['result', 'success', 'happy', 'better', 'improve', 'lose', 'goal', 'achiev', 'great', 'best', 'love', 'результат', 'успех', 'счаст', 'лучше', 'улучш', 'похуд', 'цель', 'достиж', 'отличн', 'любим', 'успіх', 'щаст', 'краще', 'покращ', 'схуд', 'мет', 'досяг', 'чудов'], pace: 0 },
  bed_corporate: { mood: 'business-like, trustworthy', kw: ['business', 'money', 'client', 'service', 'profit', 'invest', 'market', 'company', 'sales', 'price', 'бизнес', 'деньг', 'клиент', 'сервис', 'прибыл', 'инвест', 'рынок', 'компани', 'продаж', 'цен', 'бізнес', 'гроші', 'клієнт', 'сервіс', 'прибут', 'інвест', 'ринок', 'компані', 'продаж', 'ціна'], pace: 0 },
  bed_tension: { mood: 'tense, suspenseful', kw: ['danger', 'warning', 'mistake', 'secret', 'truth', 'risk', 'shock', 'never', 'stop', 'wrong', 'lie', 'myth', 'опасн', 'предупрежд', 'ошибк', 'секрет', 'правд', 'риск', 'шок', 'никогда', 'стоп', 'неправ', 'ложь', 'миф', 'небезпечн', 'попередж', 'помилк', 'таємн', 'правда', 'ризик', 'ніколи', 'неправ', 'брехн', 'міф'], pace: -1 },
  bed_epic: { mood: 'big and powerful', kw: ['transform', 'history', 'legend', 'ultimate', 'incredible', 'world', 'change', 'journey', 'record', 'преобразов', 'истори', 'легенд', 'невероят', 'мир', 'перемен', 'путь', 'рекорд', 'перетвор', 'історі', 'легенд', 'неймовір', 'світ', 'змін', 'шлях', 'рекорд'], pace: 0 },
  bed_tech: { mood: 'modern, technical', kw: ['tech', 'data', 'app', 'digital', 'science', 'study', 'research', 'ai', 'algorithm', 'analytic', 'stat', 'технолог', 'данн', 'приложен', 'цифров', 'наук', 'исследован', 'алгоритм', 'аналитик', 'статистик', 'дані', 'додаток', 'цифров', 'дослідж', 'аналітик', 'статистик'], pace: 0 },
  bed_warm: { mood: 'warm and human', kw: ['family', 'care', 'health', 'body', 'story', 'feel', 'heart', 'thank', 'body', 'семь', 'забот', 'здоровь', 'тело', 'истори', 'чувств', 'сердц', 'спасибо', 'тепл', 'сім', 'турбот', 'здоров', 'тіло', 'відчу', 'серц', 'дякую', 'тепл'], pace: -1 },
  bed_news: { mood: 'news-like, urgent', kw: ['breaking', 'news', 'report', 'official', 'announce', 'latest', 'today', 'срочн', 'новост', 'сообщ', 'официальн', 'объяв', 'последн', 'терміно', 'новин', 'повідом', 'офіційн', 'оголош', 'остан'], pace: 1 }
  ,
  bed_news_urgent: { mood: 'urgent news, pulsing', kw: ['urgent', 'alert', 'just in', 'now', 'immediately', 'срочн', 'тревог', 'немедленн', 'прямо сейчас', 'терміно', 'негайно', 'зараз'], pace: 1 },
  bed_news_studio: { mood: 'news studio, confident', kw: ['analysis', 'expert', 'review', 'explain', 'overview', 'anchor', 'анализ', 'эксперт', 'обзор', 'объясн', 'аналіз', 'експерт', 'огляд', 'поясн'], pace: 0 },
  bed_news_breaking: { mood: 'breaking news, ticking', kw: ['breaking', 'exclusive', 'leak', 'scandal', 'confirmed', 'эксклюзив', 'утечк', 'скандал', 'подтвержд', 'ексклюзив', 'витік', 'скандал', 'підтверд'], pace: 1 },
  bed_news_report: { mood: 'serious report', kw: ['investigation', 'report', 'fact', 'evidence', 'court', 'law', 'расследован', 'факт', 'доказательств', 'суд', 'закон', 'розслідув', 'доказ', 'закон'], pace: -1 },
  bed_news_sport: { mood: 'sports news, driving', kw: ['sport', 'league', 'match', 'score', 'champion', 'cup', 'team', 'спорт', 'лиг', 'счёт', 'чемпион', 'кубок', 'команд', 'ліг', 'рахунок', 'чемпіон', 'кубок'], pace: 1 },
  bed_news_evening: { mood: 'evening news summary, warm', kw: ['summary', 'results', 'week', 'evening', 'recap', 'итог', 'результаты', 'недел', 'вечер', 'подвед', 'підсум', 'результати', 'тижн', 'вечір'], pace: -1 }
};
// small prior by niche (id or name): which moods usually fit
const PRIOR = [[/weight|diet|health|fit|похуд|здоров/i, { bed_warm: 1.2, bed_uplift: 1.2, bed_chill: 0.8 }], [/sport|bet|casino|match|ставк|спорт/i, { bed_drive: 1.5, bed_tension: 0.8, bed_pulse: 0.8 }], [/financ|money|business|invest|бизнес|финанс/i, { bed_corporate: 1.5, bed_tech: 0.6 }], [/tech|ai|app|it\b/i, { bed_tech: 1.5 }]];

const stems = [];
for (const [id, b] of Object.entries(BEDS)) for (const k of b.kw) stems.push([id, k]);
const isWord = ch => /[\p{L}\p{N}]/u.test(ch || '');

function suggest(p, niche, labels = {}) {
  const text = String(p.script || (p.words || []).map(w => w.w).join(' ')).toLowerCase();
  const words = text.split(/[^\p{L}\p{N}']+/u).filter(Boolean), score = {}, hits = {};
  for (const id of Object.keys(BEDS)) { score[id] = 0; hits[id] = new Set(); }
  // a word counts when it starts with a stem (so “похудеть” matches “похуд”); short English stems must be whole words
  for (const w of words) for (const [id, k] of stems) {
    const ok = k.length <= 3 ? w === k : w.startsWith(k);
    if (ok) { score[id] += 1; hits[id].add(k); }
  }
  // pace: words per second of the spoken part
  const dur = (p.words && p.words.length) ? p.words[p.words.length - 1].end - p.words[0].start : (p.duration || 0);
  const wps = dur > 3 ? (p.words || []).length / dur : 0, pace = !wps ? 0 : wps < 2.1 ? -1 : wps > 2.9 ? 1 : 0;
  const tag = `${niche && niche.id || ''} ${niche && niche.name || ''}`;
  const prior = {}; for (const [re, m] of PRIOR) if (re.test(tag)) for (const [id, v] of Object.entries(m)) prior[id] = (prior[id] || 0) + v;
  const total = Math.max(1, words.length), out = [];
  for (const [id, b] of Object.entries(BEDS)) {
    const kw = score[id] / Math.sqrt(total / 40);                       // longer scripts do not simply win
    const s = kw * 1.0 + (pace && b.pace === pace ? 0.8 : pace && b.pace === -pace ? -0.4 : 0) + (prior[id] || 0);
    const why = [];
    if (hits[id].size) why.push('Words that fit: ' + [...hits[id]].slice(0, 4).join(', '));
    if (pace && b.pace === pace) why.push(pace < 0 ? 'Calm speaking pace' : 'Fast speaking pace');
    if (prior[id]) why.push('Typical for this niche');
    out.push({ id, label: labels[id] || id, mood: b.mood, score: +s.toFixed(2), why });
  }
  out.sort((a, b) => b.score - a.score);
  // nothing stood out: a neutral bed fits any script
  if (!out[0] || out[0].score < 0.5) { const n = out.find(x => x.id === 'bed_chill'); if (n && !n.why.length) n.why.push('A neutral background that fits any script'); out.splice(out.indexOf(n), 1); out.unshift({ ...n, score: Math.max(n.score, 0.5) }); }
  return { wps: +wps.toFixed(2), pace, items: out.filter((x, k) => k === 0 || x.score >= 0.3).slice(0, 3) };
}
module.exports = { suggest, BEDS };
