// Job journal: every analysis / render / assemble job is written down when it is queued and removed when it ends.
// After a crash or restart the leftovers are moved to a "recover" list that the app offers to resume.
const fs = require('fs'), path = require('path');
const RUN = path.join(__dirname, '..', 'data', 'journal.json'), REC = path.join(__dirname, '..', 'data', 'recovery.json');
const rd = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return []; } };
const wr = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 1));

const runAdd = job => { const l = rd(RUN); l.push(job); wr(RUN, l); };
const runRemove = id => { const l = rd(RUN); wr(RUN, l.filter(j => j.id !== id)); };
// at start-up: whatever is still in the journal never finished
function takeInterrupted(describe) {
  const left = rd(RUN), rec = rd(REC);
  for (const j of left) if (!rec.some(r => r.projectId === j.projectId && r.kind === j.kind)) rec.push({ ...j, interruptedAt: Date.now(), ...(describe ? describe(j) : {}) });
  wr(RUN, []); wr(REC, rec); return rec;
}
const list = () => rd(REC);
const remove = id => { const l = rd(REC); wr(REC, l.filter(j => j.id !== id)); return l.find(j => j.id === id) || null; };
module.exports = { runAdd, runRemove, takeInterrupted, list, remove };
