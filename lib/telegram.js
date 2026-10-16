// Telegram notifications: finished videos, finished tasks, failures, health changes.
// The bot token comes from @BotFather and is pasted by the user; it is stored only in data/settings.json and never logged.
const fs = require('fs'), path = require('path');
const API = () => (process.env.TELEGRAM_API || 'https://api.telegram.org').replace(/\/$/, '');
const DEFAULTS = { ready: true, video: true, taskDone: true, errors: true, health: true, backup: false, asana: true, approval: true, lang: 'ru' };
const MAX_VIDEO = 49 * 1024 * 1024;     // bots may upload files up to 50 MB

const TXT = {
  en: {
    test: '✅ Video Studio is connected. You will get notifications here.',
    ready: (n, d) => `✅ Ready: ${n}${d ? '\n' + d : ''}`,
    taskDone: (t, n) => `🎉 Task “${t}”: all ${n} video(s) are ready`,
    failed: (k, n, e) => `❌ ${k} failed: ${n}${e ? '\n' + e : ''}`,
    kind: { analyze: 'Analysis', render: 'Render', assemble: 'Assembling segments' },
    healthBad: r => `⚠️ Video Studio needs a look:\n${r.map(x => '• ' + x).join('\n')}`,
    healthOk: '✅ Video Studio: everything is fine again',
    restart: n => `🔄 The server restarted${n ? `, ${n} job(s) were interrupted (restart them in Projects)` : ''}`,
    backupFail: e => `⚠️ Backup failed: ${e}`,
    comment: (by, task, text, url, site) => `💬 ${by} wrote in “${task}”:\n${text}${url ? '\n' + url : ''}${site ? '\n' + site : ''}`,
    autoOk: (n, d) => `✅ Approved automatically (${d} days without edits): ${n}`,
    big: 'video is larger than 50 MB, not attached',
    sizes: 'sizes', check: 'check', ok: 'ok', warn: 'warnings', fail: 'problems'
  },
  ru: {
    test: '✅ Video Studio подключена. Уведомления будут приходить сюда.',
    ready: (n, d) => `✅ Готово: ${n}${d ? '\n' + d : ''}`,
    taskDone: (t, n) => `🎉 Задание «${t}»: все видео готовы (${n})`,
    failed: (k, n, e) => `❌ ${k}: ошибка, ${n}${e ? '\n' + e : ''}`,
    kind: { analyze: 'Анализ', render: 'Рендер', assemble: 'Сборка сегментов' },
    healthBad: r => `⚠️ Video Studio, стоит посмотреть:\n${r.map(x => '• ' + x).join('\n')}`,
    healthOk: '✅ Video Studio: снова всё в порядке',
    restart: n => `🔄 Сервер перезапустился${n ? `, прервано работ: ${n} (перезапустите их в «Проектах»)` : ''}`,
    backupFail: e => `⚠️ Не удалось сделать резервную копию: ${e}`,
    comment: (by, task, text, url, site) => `💬 ${by} написал(а) в «${task}»:\n${text}${url ? '\n' + url : ''}${site ? '\n' + site : ''}`,
    autoOk: (n, d) => `✅ Принят автоматически (${d} дн. без правок): ${n}`,
    big: 'видео больше 50 МБ, не прикреплено',
    sizes: 'размеров', check: 'проверка', ok: 'ок', warn: 'есть предупреждения', fail: 'есть проблемы'
  },
  uk: {
    test: '✅ Video Studio підключено. Сповіщення надходитимуть сюди.',
    ready: (n, d) => `✅ Готово: ${n}${d ? '\n' + d : ''}`,
    taskDone: (t, n) => `🎉 Завдання «${t}»: усі відео готові (${n})`,
    failed: (k, n, e) => `❌ ${k}: помилка, ${n}${e ? '\n' + e : ''}`,
    kind: { analyze: 'Аналіз', render: 'Рендер', assemble: 'Збірка сегментів' },
    healthBad: r => `⚠️ Video Studio, варто глянути:\n${r.map(x => '• ' + x).join('\n')}`,
    healthOk: '✅ Video Studio: знову все гаразд',
    restart: n => `🔄 Сервер перезапустився${n ? `, перервано робіт: ${n} (перезапустіть їх у «Проєктах»)` : ''}`,
    backupFail: e => `⚠️ Не вдалося зробити резервну копію: ${e}`,
    comment: (by, task, text, url, site) => `💬 ${by} написав(ла) у «${task}»:\n${text}${url ? '\n' + url : ''}${site ? '\n' + site : ''}`,
    autoOk: (n, d) => `✅ Прийнято автоматично (${d} дн. без правок): ${n}`,
    big: 'відео більше 50 МБ, не додано',
    sizes: 'розмірів', check: 'перевірка', ok: 'ок', warn: 'є попередження', fail: 'є проблеми'
  }
};

function create(ctx) {
  const { SETTINGS, pdir, creativesOf, taskslib } = ctx;
  const rd = () => { try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch { return {}; } };
  const cfg = () => { const s = rd(); return { token: s.telegramToken || '', chat: s.telegramChat || '', prefs: { ...DEFAULTS, ...(s.telegramPrefs || {}) } }; };
  const save = patch => { const s = rd(); Object.assign(s, patch); fs.writeFileSync(SETTINGS, JSON.stringify(s)); };
  const L = () => TXT[cfg().prefs.lang] || TXT.ru;
  const enabled = () => { const c = cfg(); return !!(c.token && c.chat); };

  async function call(token, method, body, form) {
    const r = await fetch(`${API()}/bot${token}/${method}`, form ? { method: 'POST', body: form } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) { const e = new Error(j.description || ('Telegram error ' + r.status)); e.code = j.error_code || r.status; e.retry = j.parameters && j.parameters.retry_after; throw e; }
    return j.result;
  }
  // one message at a time, retried a few times; never throws into the caller
  let chain = Promise.resolve();
  function enqueue(job) { chain = chain.then(async () => { for (let i = 0; i < 3; i++) { try { return await job(); } catch (e) { if (e.code === 401 || e.code === 403 || e.code === 400) { console.error('telegram:', e.message); return; } await new Promise(r => setTimeout(r, (e.retry ? e.retry * 1000 : 2000 * (i + 1)))); } } console.error('telegram: giving up on a message'); }); return chain; }
  const sendText = text => { const c = cfg(); return enqueue(() => call(c.token, 'sendMessage', { chat_id: c.chat, text: String(text).slice(0, 4000), disable_web_page_preview: true })); };
  const sendVideo = (file, caption) => {
    const c = cfg();
    return enqueue(async () => {
      const buf = fs.readFileSync(file), form = new FormData();
      form.append('chat_id', c.chat); form.append('caption', String(caption).slice(0, 1000)); form.append('supports_streaming', 'true');
      form.append('video', new Blob([buf], { type: 'video/mp4' }), path.basename(file));
      return call(c.token, 'sendVideo', null, form);
    });
  };
  const gate = key => { const c = cfg(); return c.token && c.chat && c.prefs[key]; };

  // ---- events ----
  function qcWord(p) { const q = p.qcPost; if (!q) return ''; const L1 = L(); return `${L1.check}: ${q.status === 'fail' ? L1.fail : q.status === 'warn' ? L1.warn : L1.ok}`; }
  async function rendered(p) {
    try {
      const c = cfg(), l = L();
      if (gate('ready')) {
        const ex = Object.keys(p.extraOuts || {}).length, bits = [];
        if (ex) bits.push(`${1 + ex} ${l.sizes}`);
        if (p.duration) bits.push(Math.round(p.duration) + ' s');
        const q = qcWord(p); if (q) bits.push(q);
        const msg = l.ready(p.name, bits.join(' · '));
        const file = p.outFile ? path.join(pdir(p.id), p.outFile) : null;
        if (c.prefs.video && file && fs.existsSync(file)) {
          if (fs.statSync(file).size <= MAX_VIDEO) await sendVideo(file, msg); else await sendText(msg + '\n(' + l.big + ')');
        } else await sendText(msg);
      }
      if (p.taskId && gate('taskDone')) {
        const t = taskslib.get(p.taskId), cs = creativesOf(p.taskId);
        if (t && cs.length && cs.every(x => x.outFile) && t.notifiedTotal !== cs.length) { taskslib.patch(t.id, { notifiedTotal: cs.length }); await sendText(l.taskDone(t.title, cs.length)); }
      }
    } catch (e) { console.error('telegram rendered:', e.message); }
  }
  function failed(kind, p, error) { try { if (gate('errors')) { const l = L(); sendText(l.failed(l.kind[kind] || kind, p.name, String(error || '').slice(0, 300))); } } catch {} }
  // the health reasons are English sentences from lib/maint.js; translate the known patterns for ru / uk
  const HR = [
    [/^Only ([\d.]+) GB of disk space left$/, ['Осталось всего $1 ГБ на диске', 'Залишилось лише $1 ГБ на диску']],
    [/^Disk space is getting low \(([\d.]+) GB free\)$/, ['Место на диске заканчивается (свободно $1 ГБ)', 'Місце на диску закінчується (вільно $1 ГБ)']],
    [/^(\d+) project\(s\) ended with an error$/, ['Проектов с ошибкой: $1', 'Проєктів із помилкою: $1']],
    [/^(\d+) interrupted job\(s\) can be restarted$/, ['Прерванных работ, которые можно перезапустить: $1', 'Перервані роботи, які можна перезапустити: $1']],
    [/^A job has been running for more than 40 minutes$/, ['Работа выполняется уже больше 40 минут', 'Робота виконується вже понад 40 хвилин']],
    [/^(.+) is not working$/, ['$1: не работает', '$1: не працює']],
    [/^The last backup is older than 3 days$/, ['Последней резервной копии больше 3 дней', 'Останній резервній копії понад 3 дні']],
    [/^No backup has been made yet$/, ['Резервных копий ещё не делали', 'Резервних копій ще не робили']],
    [/^The server restarted (\d+) times in the last 24 hours$/, ['Сервер перезапускался за 24 часа раз: $1', 'Сервер перезапускався за 24 години разів: $1']]
  ];
  const trReason = (r, lang) => { if (lang === 'en') return r; const i = lang === 'uk' ? 1 : 0; for (const [re, t] of HR) if (re.test(r)) return r.replace(re, t[i]); return r; };
  function health(level, reasons, lastSig) {   // returns the new signature; sends only on change
    const sig = level === 'ok' ? 'ok' : reasons.join('|');
    if (sig === lastSig) return sig;
    try {
      if (gate('health')) { const l = L(), lang = cfg().prefs.lang; if (level === 'ok') { if (lastSig && lastSig !== 'ok') sendText(l.healthOk); } else sendText(l.healthBad(reasons.map(r => trReason(r, lang)))); }
    } catch {}
    return sig;
  }
  function restarted(n) { try { if (gate('errors')) sendText(L().restart(n)); } catch {} }
  function backupFailed(e) { try { if (gate('backup') || gate('errors')) sendText(L().backupFail(e)); } catch {} }

  // ---- routes ----
  function mount(app, wrap) {
    const view = async () => { const c = cfg(); let bot = null; if (c.token) { try { bot = (await call(c.token, 'getMe')).username; } catch {} } return { hasToken: !!c.token, chat: c.chat, prefs: c.prefs, bot, enabled: enabled() }; };
    app.get('/api/telegram', wrap(async (req, res) => res.json(await view())));
    app.post('/api/telegram/save', wrap(async (req, res) => {
      const b = req.body || {}, patch = {};
      if (b.token) {
        const tok = String(b.token).trim();
        if (!/^\d+:[\w-]{20,}$/.test(tok)) return res.status(400).json({ error: 'That does not look like a bot token. It looks like 123456789:AAH… (from @BotFather).' });
        try { await call(tok, 'getMe'); } catch (e) { return res.status(400).json({ error: 'Telegram rejected the token: ' + e.message }); }
        patch.telegramToken = tok;
      }
      if (b.chat !== undefined) patch.telegramChat = String(b.chat).trim();
      if (b.clear) { patch.telegramToken = ''; patch.telegramChat = ''; }
      if (b.prefs) { const p = { ...DEFAULTS, ...(cfg().prefs) }; for (const k of Object.keys(DEFAULTS)) if (b.prefs[k] !== undefined) p[k] = k === 'lang' ? (TXT[b.prefs[k]] ? b.prefs[k] : 'ru') : !!b.prefs[k]; patch.telegramPrefs = p; }
      save(patch); res.json(await view());
    }));
    // find the chat: the user writes anything to the bot, we read the latest update
    app.post('/api/telegram/detect', wrap(async (req, res) => {
      const c = cfg(); if (!c.token) return res.status(400).json({ error: 'Paste the bot token first.' });
      let ups; try { ups = await call(c.token, 'getUpdates', { limit: 20, timeout: 0 }); } catch (e) { return res.status(400).json({ error: e.message }); }
      const msgs = ups.map(u => u.message || u.channel_post || (u.my_chat_member && { chat: u.my_chat_member.chat })).filter(Boolean).reverse();
      const m = msgs.find(x => x.chat && x.chat.type === 'private') || msgs[0];
      if (!m) return res.status(404).json({ error: 'No messages found. Open your bot in Telegram, press Start (or write “hi”), then try again.' });
      save({ telegramChat: String(m.chat.id) }); res.json({ chat: String(m.chat.id), name: m.chat.first_name || m.chat.title || '' });
    }));
    app.post('/api/telegram/test', wrap(async (req, res) => {
      const c = cfg(); if (!c.token || !c.chat) return res.status(400).json({ error: 'Add the token and the chat first.' });
      try { await call(c.token, 'sendMessage', { chat_id: c.chat, text: L().test }); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e.message }); }
    }));
  }
  // a buyer wrote in the Asana task / a creative was approved automatically
  async function buyerComment(o) { try { if (gate('asana')) await sendText(L().comment(o.by, o.task, String(o.text).slice(0, 300), o.url, o.site)); } catch (e) { console.error('telegram comment:', e.message); } }
  async function autoApproved(o) { try { if (gate('approval')) await sendText(L().autoOk(o.name, o.days)); } catch (e) { console.error('telegram approval:', e.message); } }
  return { mount, rendered, failed, health, restarted, backupFailed, enabled, buyerComment, autoApproved };
}
module.exports = { create };
