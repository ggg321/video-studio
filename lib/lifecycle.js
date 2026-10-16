// Life of a creative after it is made: work -> review (handed over) -> changes (the buyer asked for edits) -> approved.
// "approved" = handed over and no edits came: set by a person, or automatically after N quiet days (setting).
const STATES = ['work', 'review', 'changes', 'approved'];
const DAY = 86400000;

const get = p => p.life || { state: 'work', since: p.created || 0, history: [] };
const state = p => get(p).state;

function setState(p, to, opts = {}) {
  if (!STATES.includes(to)) throw new Error('Unknown state.');
  const l = p.life = p.life || { state: 'work', since: Date.now(), history: [] }, from = l.state;
  l.state = to; l.since = Date.now();
  if (to === 'review') l.handedAt = Date.now();
  l.history.push({ at: Date.now(), kind: 'state', from, to, by: String(opts.by || '').slice(0, 60), note: String(opts.note || '').slice(0, 1000), auto: !!opts.auto });
  if (l.history.length > 100) l.history = l.history.slice(-100);
  return l;
}
// a comment attached to the creative (an edit request, a note); optionally restarts the quiet-days countdown
function addComment(p, c, resetCountdown) {
  const l = p.life = p.life || { state: 'work', since: Date.now(), history: [] };
  l.history.push({ at: Date.now(), kind: 'comment', by: String(c.by || '').slice(0, 60), text: String(c.text || '').slice(0, 2000), source: c.source || 'manual' });
  if (l.history.length > 100) l.history = l.history.slice(-100);
  if (resetCountdown && l.state === 'review') l.handedAt = Date.now();
  return l;
}
// days left before the automatic approval (null when it does not apply)
function daysLeft(p, days, now = Date.now()) {
  const l = get(p); if (!days || l.state !== 'review' || !l.handedAt) return null;
  return +(((l.handedAt + days * DAY) - now) / DAY).toFixed(2);
}
const due = (p, days, now = Date.now()) => { const d = daysLeft(p, days, now); return d != null && d <= 0; };
module.exports = { STATES, get, state, setState, addComment, daysLeft, due };
