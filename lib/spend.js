// What the paid services cost today. Grok prices are known; ElevenLabs and HeyGen depend on your plan, so their cost is an estimate
// from the rates set in Settings (0 = not counted). The daily limit applies to batches started with "Make all" and to Grok clips.
const fs = require('fs'), path = require('path');
const FILE = process.env.SPEND_FILE || path.join(__dirname, '..', 'data', 'spend.json');
const rd = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; } };
const DAY = 86400000;
const startOfDay = (now = Date.now()) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); };

function add(service, usd, note) {
  usd = +usd || 0; if (usd <= 0) return;
  const l = rd().filter(x => Date.now() - x.at < 60 * DAY); l.push({ at: Date.now(), service, usd: +usd.toFixed(4), note: String(note || '').slice(0, 120) });
  fs.writeFileSync(FILE, JSON.stringify(l));
}
const today = (now = Date.now()) => +rd().filter(x => x.at >= startOfDay(now)).reduce((a, x) => a + x.usd, 0).toFixed(2);
// would a new spend of `usd` go over the daily limit (0 = no limit)?
function check(limit, usd, now = Date.now()) {
  limit = +limit || 0; const spent = today(now);
  return { limit, spent, after: +(spent + (+usd || 0)).toFixed(2), over: limit > 0 && spent + (+usd || 0) > limit };
}
const rates = s => ({ eleven: +s.rateElevenPer1k >= 0 && s.rateElevenPer1k !== undefined ? +s.rateElevenPer1k : 0.3, heygen: +s.rateHeygenPerMin >= 0 && s.rateHeygenPerMin !== undefined ? +s.rateHeygenPerMin : 0 });
module.exports = { add, today, check, rates, startOfDay };
