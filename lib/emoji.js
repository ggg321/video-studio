// Thematic emoji above the captions: keyword -> emoji (many languages), picture files, automatic placement.
// Pictures: data/emoji/<codepoints>.png wins (a downloaded set, e.g. Fluent 3D); otherwise the emoji is drawn locally from
// Windows' "Segoe UI Emoji" font by tools/emoji_render.py. Apple's emoji font is not available on Windows and cannot be redistributed.
const fs = require('fs'), path = require('path'), { execFile } = require('child_process');
const ROOT = path.join(__dirname, '..'), DIR = path.join(ROOT, 'data', 'emoji'), LOCAL = path.join(DIR, 'local');

// [emoji, [keyword prefixes in en / pt / es / it / fr / de / nl / pl / ru / uk]]  (matched against the start of a word, accents ignored)
const E = [
  ['💰', ['money', 'cash', 'dinheiro', 'dinero', 'soldi', 'argent', 'geld', 'pieniad', 'pieniędz', 'деньг', 'деньж', 'грош', 'rendiment', 'income', 'ingres', 'salar', 'зарплат', 'прибыл', 'прибут', 'profit', 'lucro', 'winst', 'gewinn', 'zysk']],
  ['💶', ['euro', '€', 'eur']],
  ['💵', ['dollar', 'dolar', 'доллар', 'долар', '$', 'usd']],
  ['📈', ['invest', 'инвест', 'crescim', 'growth', 'crecim', 'groei', 'wachstum', 'wzrost', 'рост', 'зростан', 'sucess', 'success', 'sukces', 'успех', 'успіх']],
  ['📉', ['loss', 'perda', 'verlies', 'strata', 'потер', 'втрат', 'queda']],
  ['✅', ['garant', 'guarant', 'гарант', 'verified', 'verific', 'confirm', 'подтверд', 'підтверд', 'certif', 'conform']],
  ['🔒', ['segur', 'secure', 'safe', 'sicher', 'veilig', 'bezpiecz', 'безопас', 'безпек', 'protec', 'protez', 'schutz']],
  ['🏛️', ['estatal', 'estado', 'state', 'govern', 'gouvern', 'regering', 'staat', 'rząd', 'rzad', 'государ', 'держав', 'уряд', 'правитель', 'officia']],
  ['📋', ['programa', 'program', 'plano', 'plan', 'plano', 'list', 'liste', 'lijst', 'план', 'список', 'documento', 'document', 'formul']],
  ['🎯', ['objecti', 'objeti', 'goal', 'target', 'obiettiv', 'objectif', 'doel', 'ziel', 'cel ', 'цель', 'ціль', 'meta']],
  ['🛠️', ['ferrament', 'tool', 'herramient', 'strument', 'outil', 'werkzeug', 'gereedschap', 'narzędz', 'narzedz', 'инструмент', 'інструмент']],
  ['👥', ['pessoa', 'people', 'persona', 'persone', 'gens', 'menschen', 'mensen', 'ludzi', 'люди', 'людей', 'people', 'portugueses', 'comuns', 'familia', 'family', 'famil', 'семь', 'сімʼ', 'сім’']],
  ['⏰', ['tempo', 'time', 'tiempo', 'tempo', 'temps', 'zeit', 'tijd', 'czas', 'врем', 'час', 'urgent', 'agora', 'now', 'ahora', 'jetzt', 'nu ', 'сейчас', 'зараз', 'hoje', 'today', 'hoy', 'heute', 'vandaag', 'сегодня', 'сьогодні']],
  ['📅', ['dia ', 'day', 'dias', 'días', 'jour', 'tag', 'dag', 'dzien', 'день', 'дні', 'mensal', 'month', 'mes ', 'monat', 'maand', 'miesi', 'месяц', 'місяц', 'seguinte', 'semana', 'week', 'woche', 'неделя', 'тиждень']],
  ['⭐', ['estrela', 'star', 'estrella', 'stella', 'étoile', 'stern', 'ster', 'gwiazd', 'звезд', 'зірк', 'melhor', 'best', 'mejor', 'migliore', 'meilleur', 'beste', 'najlep', 'лучш', 'найкращ']],
  ['❤️', ['amor', 'love', 'amore', 'amour', 'liebe', 'liefde', 'miłość', 'milosc', 'любов', 'любл', 'coração', 'coracao', 'heart', 'corazon', 'cuore', 'coeur', 'herz', 'hart', 'serce', 'сердц', 'серц']],
  ['💪', ['forca', 'força', 'strong', 'fuerza', 'forza', 'force', 'kraft', 'kracht', 'siła', 'sila', 'сила', 'сильн', 'músculo', 'musculo', 'muscle', 'spier', 'muskel', 'mięsi', 'мышц', "м'яз", 'мʼяз']],
  ['🔥', ['fogo', 'fire', 'fuego', 'fuoco', 'feu', 'feuer', 'vuur', 'ogień', 'ogien', 'огонь', 'вогонь', 'quente', 'hot ', 'caliente', 'caldo', 'chaud', 'heiß', 'heet', 'горяч', 'гарячий']],
  ['🚀', ['rocket', 'foguete', 'lanc', 'launch', 'start ', 'ruszy', 'запуск', 'старт', 'arranc', 'comec', 'começ', 'begin', 'beginnen']],
  ['⚠️', ['atenc', 'atenç', 'attention', 'atención', 'attenzione', 'achtung', 'aandacht', 'uwaga', 'внимани', 'уваг', 'cuidado', 'careful', 'warning', 'aviso', 'perig', 'danger', 'gefahr', 'gevaar', 'опасн', 'небезпе']],
  ['🏆', ['ganhar', 'win', 'ganar', 'vincere', 'gagner', 'gewinnen', 'winnen', 'wygra', 'побед', 'перемог', 'vencer', 'campe', 'champion', 'prémio', 'premio', 'prize', 'preis', 'prijs', 'nagrod', 'приз']],
  ['🎁', ['gratis', 'grátis', 'free ', 'gratuit', 'kostenlos', 'gratis', 'darmow', 'бесплат', 'безкошт', 'presente', 'gift', 'regalo', 'cadeau', 'geschenk', 'cadeau', 'prezent', 'подар']],
  ['📱', ['telefone', 'telemovel', 'telemóvel', 'phone', 'teléfono', 'telefono', 'téléphone', 'handy', 'telefoon', 'telefon', 'телефон', 'smartphone', 'app ', 'aplica', 'застосунок']],
  ['💻', ['computador', 'computer', 'ordenador', 'ordinateur', 'rechner', 'komputer', 'компьютер', 'комп’ютер', 'online', 'internet', 'site', 'website', 'sait']],
  ['🏠', ['casa', 'home', 'house', 'maison', 'haus', 'huis', 'dom ', 'дом', 'будинок', 'habita', 'apartment', 'apartamento', 'imóvel', 'imovel', 'квартир']],
  ['🚗', ['carro', 'car ', 'coche', 'auto', 'voiture', 'wagen', 'samoch', 'машин', 'автомоб', 'veículo', 'veiculo']],
  ['✈️', ['viag', 'travel', 'viaje', 'viaggio', 'voyage', 'reise', 'reis', 'podróż', 'podroz', 'путешеств', 'подорож', 'avião', 'aviao', 'plane', 'flight', 'voo']],
  ['⚖️', ['peso', 'weight', 'gewicht', 'waga', 'вес', 'вага', 'poids', 'kilo', 'кило', 'balan', 'afval', 'abnehm', 'schudn', 'похуд', 'схуд', 'emagrec']],
  ['🥗', ['salada', 'salad', 'ensalada', 'insalata', 'salade', 'salat', 'sałat', 'салат', 'legum', 'vegetable', 'verdura', 'légume', 'gemüse', 'groente', 'warzyw', 'овощ', 'овоч', 'dieta', 'diet', 'dieet', 'saudável', 'saudavel', 'healthy', 'saludable', 'sano', 'sain', 'gezond', 'zdrow', 'здоров']],
  ['🍎', ['maca', 'maçã', 'apple', 'manzana', 'mela', 'pomme', 'apfel', 'appel', 'jabłk', 'яблок', 'fruta', 'fruit', 'obst', 'owoc', 'фрукт']],
  ['🏃', ['correr', 'run', 'courir', 'laufen', 'lopen', 'bieg', 'бег', 'біг', 'exerc', 'trein', 'training', 'ćwicz', 'трениров', 'вправ', 'caminhad', 'walk', 'wandel', 'spacer', 'прогулк', 'ходьб']],
  ['💧', ['agua', 'água', 'water', 'acqua', 'eau', 'wasser', 'woda', 'вода', 'водн', 'hidrat']],
  ['🍋', ['limao', 'limão', 'lemon', 'limón', 'limone', 'citron', 'zitrone', 'cytryn', 'лимон']],
  ['🍪', ['cookie', 'biscoito', 'galleta', 'biscotto', 'biscuit', 'keks', 'koek', 'ciastk', 'печень']],
  ['🍷', ['vinho', 'wine', 'vino', 'vin ', 'wein', 'wijn', 'wino', 'вино', 'álcool', 'alcool', 'alcohol', 'алкогол']],
  ['😴', ['sono', 'sleep', 'sueño', 'sonno', 'sommeil', 'schlaf', 'slaap', 'sen ', 'сон', 'спат', 'спати', 'cansa', 'tired', 'cansado', 'müde', 'moe ', 'устал', 'втом']],
  ['😟', ['stress', 'estresse', 'ansied', 'anxiety', 'ansiedad', 'ansia', 'angst', 'lęk', 'тревог', 'тривог', 'preocup', 'worry', 'zorg']],
  ['🩺', ['medico', 'médico', 'doctor', 'médecin', 'arzt', 'arts', 'lekarz', 'врач', 'лікар', 'médic', 'saúde', 'saude', 'health', 'salud', 'salute', 'santé', 'gesundheit', 'gezondheid', 'zdrowie', 'здоровье', 'здоров’я']],
  ['💊', ['remedio', 'remédio', 'medicin', 'medicam', 'pill', 'pilula', 'píldora', 'farmac', 'pharma', 'tablet', 'лекарств', 'ліки', 'таблет']],
  ['🧠', ['cerebr', 'brain', 'cervell', 'cerveau', 'gehirn', 'hersen', 'mózg', 'mozg', 'мозг', 'мозок', 'mente', 'mind', 'esprit', 'geist', 'geest', 'umysł', 'pensar', 'think', 'denken', 'мысл', 'думк']],
  ['👀', ['olhar', 'look', 'mirar', 'guardare', 'regarder', 'schauen', 'kijken', 'patrz', 'смотр', 'дивит', 'ver ', 'see ', 'veja', 'watch', 'assist']],
  ['❓', ['pergunta', 'question', 'pregunta', 'domanda', 'frage', 'vraag', 'pytani', 'вопрос', 'питанн', 'porqu', 'why', 'warum', 'waarom', 'dlaczego', 'почему', 'чому']],
  ['👍', ['bom', 'good', 'bueno', 'buono', 'bon ', 'gut', 'goed', 'dobr', 'хорош', 'добр', 'perfeito', 'perfect', 'perfetto', 'parfait', 'perfekt', 'doskonał', 'отличн']],
  ['🎉', ['festa', 'party', 'fiesta', 'festa', 'fête', 'feest', 'impreza', 'праздник', 'свято', 'parabéns', 'parabens', 'congrat', 'felicit', 'gratul', 'поздрав']],
  ['🔑', ['chave', 'key ', 'clave', 'chiave', 'clé', 'schlüssel', 'sleutel', 'klucz', 'ключ', 'segredo', 'secret', 'secreto', 'segreto', 'geheim', 'sekret', 'секрет', 'таємниц']],
  ['📞', ['ligar', 'call', 'llamar', 'chiamare', 'appeler', 'anrufen', 'bellen', 'dzwoni', 'звон', 'дзвін', 'contacto', 'contact', 'contatto', 'kontakt']],
  ['🛒', ['comprar', 'buy', 'compra', 'acquist', 'acheter', 'kaufen', 'kopen', 'kup', 'куп', 'loja', 'shop', 'tienda', 'negozio', 'magasin', 'laden', 'winkel', 'sklep', 'магазин', 'preço', 'preco', 'price', 'precio', 'prezzo', 'prix', 'preis', 'prijs', 'cena', 'цена', 'ціна']]
];
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}€$ʼ’']/gu, '');
const KW = E.map(([e, ks]) => [e, ks.map(k => norm(k)).filter(Boolean)]);
const cp = e => [...e].map(c => c.codePointAt(0).toString(16)).filter(x => x !== 'fe0f').join('-');

// first emoji whose keyword starts a word of the text
function match(text) {
  if (/€/.test(text)) return { emoji: '💶', word: '€' };
  if (/\$/.test(text)) return { emoji: '💵', word: '$' };
  const ws = String(text).split(/\s+/).map(norm).filter(Boolean);
  for (const w of ws) for (const [e, ks] of KW) for (const k of ks) { if (k.length <= 3 ? w === k : w.startsWith(k)) return { emoji: e, word: w }; }
  return null;
}
// cues = [{start,end,text}] -> [{start,end,emoji}]; one emoji per cue at most, never closer than minGap seconds
function pick(cues, minGap = 2.4, maxPerMinute = 14) {
  const out = []; let lastEnd = -99, lastE = '';
  for (const c of cues) {
    if (c.start < lastEnd + minGap - (c.end - c.start)) { /* too close to the previous one */ if (c.start - lastEnd < minGap) continue; }
    const m = match(c.text); if (!m || m.emoji === lastE && c.start - lastEnd < minGap * 3) continue;
    out.push({ start: +c.start.toFixed(2), end: +Math.max(c.end, c.start + 1.1).toFixed(2), emoji: m.emoji }); lastEnd = out[out.length - 1].end; lastE = m.emoji;
  }
  const dur = cues.length ? cues[cues.length - 1].end : 60, cap = Math.max(3, Math.round(maxPerMinute * dur / 60));
  return out.slice(0, cap);
}

// picture file for an emoji (generated once, cached); null if it cannot be made
function asset(e) {
  const id = cp(e), a = path.join(DIR, id + '.png'), b = path.join(LOCAL, id + '.png');
  if (fs.existsSync(a)) return Promise.resolve(a);
  if (fs.existsSync(b)) return Promise.resolve(b);
  const py = require('./platform').PY;
  if (!fs.existsSync(py)) return Promise.resolve(null);
  fs.mkdirSync(LOCAL, { recursive: true });
  return new Promise(res => execFile(py, [path.join(ROOT, 'tools', 'emoji_render.py'), e, b], { timeout: 30000, windowsHide: true }, err => res(err || !fs.existsSync(b) ? null : b)));
}
const list = () => E.map(([e]) => e);
module.exports = { match, pick, asset, list, cp };
