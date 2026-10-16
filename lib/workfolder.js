// Organised work folder for a creative: source, subtitles, plan, inserts, preview, export.  exports/<task>/<NN_creative>/...
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const EXPORTS = path.join(ROOT, 'exports');
const safe = (s, d = 'untitled') => String(s || d).replace(/[\\/:*?"<>|\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || d;

function cp(src, dst) { try { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); return true; } catch { return false; } }
const csv = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';

// p = project, task = task|null, niche = niches.get(...), srt = SRT text, projectDir = projects/<id>
function build(p, task, niche, srt, projectDir, no) {
  const base = path.join(EXPORTS, safe(task ? task.title : 'Standalone creatives'), `${String(no || p.creativeNo || 1).padStart(2, '0')}_${safe(p.name)}`);
  const d = n => path.join(base, n);
  fs.mkdirSync(base, { recursive: true });
  const report = { copied: [], missing: [] };
  const take = (src, dst) => (cp(src, dst) ? report.copied.push(path.relative(base, dst)) : report.missing.push(path.basename(src)));

  // 01_source
  for (const f of [p.presenterFile, p.voiceFile].filter(Boolean)) take(path.join(projectDir, f), path.join(d('01_source'), f));
  for (const f of fs.existsSync(projectDir) ? fs.readdirSync(projectDir) : []) if (/^seg\d+_(video|voice)\./.test(f)) take(path.join(projectDir, f), path.join(d('01_source'), f));
  // 02_subtitles
  if (srt) { fs.mkdirSync(d('02_subtitles'), { recursive: true }); fs.writeFileSync(path.join(d('02_subtitles'), safe(p.name) + '.srt'), '﻿' + srt); report.copied.push('02_subtitles/' + safe(p.name) + '.srt'); }
  if (fs.existsSync(path.join(projectDir, 'subs.ass'))) take(path.join(projectDir, 'subs.ass'), path.join(d('02_subtitles'), 'subs.ass'));
  // 03_plan
  fs.mkdirSync(d('03_plan'), { recursive: true });
  fs.writeFileSync(path.join(d('03_plan'), 'script.txt'), p.script || '');
  fs.writeFileSync(path.join(d('03_plan'), 'plan.json'), JSON.stringify({ name: p.name, format: p.format, niche: p.niche, subStyle: p.subStyle, font: p.font, transition: p.transition, cuts: p.cuts || [], zooms: p.zooms || [], audio: p.audio || null, segTimes: p.segTimes || null }, null, 1));
  if (p.qcPre) fs.writeFileSync(path.join(d('03_plan'), 'qc_plan.json'), JSON.stringify(p.qcPre, null, 1));
  report.copied.push('03_plan/script.txt', '03_plan/plan.json');
  // 04_inserts (list + the clips used)
  const rows = ['start,end,type,source,text,match'];
  (p.cuts || []).forEach(c => {
    let type = 'clip', src = c.clip;
    if (c.clip === 'card') { type = 'text card'; src = c.card; }
    else if (c.clip === 'stock') { type = 'stock'; src = (c.src || '') + ' ' + (c.page || c.file || ''); if (c.file) take(path.join(projectDir, 'stock', c.file), path.join(d('04_inserts'), 'clips', c.file)); }
    else { const it = niche && niche.items.find(x => x.id === c.clip); if (it) { src = it.orig || it.file; take(niche.abs(it), path.join(d('04_inserts'), 'clips', path.basename(it.file))); } }
    rows.push([c.start, c.end, type, csv(src), csv(c.text), c.sim != null ? Math.round(c.sim * 100) + '%' : ''].join(','));
  });
  fs.mkdirSync(d('04_inserts'), { recursive: true }); fs.writeFileSync(path.join(d('04_inserts'), 'inserts.csv'), '﻿' + rows.join('\n') + '\n');
  // 05_preview, 06_export
  if (fs.existsSync(path.join(projectDir, 'preview.mp4'))) take(path.join(projectDir, 'preview.mp4'), path.join(d('05_preview'), 'preview.mp4'));
  if (p.outFile && fs.existsSync(path.join(projectDir, p.outFile))) take(path.join(projectDir, p.outFile), path.join(d('06_export'), safe(p.name) + '.mp4'));
  for (const [f, o] of Object.entries(p.extraOuts || {})) if (o.file && fs.existsSync(path.join(projectDir, o.file))) take(path.join(projectDir, o.file), path.join(d('06_export'), safe(p.name) + '_' + f + '.mp4'));
  if (fs.existsSync(path.join(projectDir, 'qc_report.json'))) take(path.join(projectDir, 'qc_report.json'), path.join(d('06_export'), 'qc_report.json'));
  return { dir: base, ...report };
}

// duplicate a project directory (media copied, never linked, so re-uploads in one copy can not change the other)
const SKIP = /^(out\.mp4|preview\.mp4|preview_.*\.jpg|band_[0-9a-f]+\.png|ov_[0-9a-f]+\.png(\.json)?|filter\.txt|subs\.ass|qc_report\.json|waveform\.json|ana\.wav|frames_in|frames_out)$/;
function duplicateDir(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const f of fs.readdirSync(srcDir)) {
    if (SKIP.test(f)) continue;
    const s = path.join(srcDir, f), t = path.join(dstDir, f);
    if (fs.statSync(s).isDirectory()) { duplicateDir(s, t); continue; }
    fs.copyFileSync(s, t);
  }
}
module.exports = { build, duplicateDir, EXPORTS, safe };
