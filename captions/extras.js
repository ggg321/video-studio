// Photo at the start + timer at the end for Subtitle Studio: the work is done by lib/wrap.js (shared with the main site).
const path = require('path'), W = require('../lib/wrap');
// o.intro = { on, sec, photo }, o.outro = { on, target (seconds), down, bg }
async function plan(j, dir, o, fontsOpt) {
  const r = await W.plan(dir, { src: j.src, W: j.W, H: j.H, duration: j.duration, hasAudio: j.hasAudio, fontsOpt, mainFilter: `ass=subs.ass:fontsdir=${fontsOpt}`,
    intro: o.intro && o.intro.on && o.intro.photo ? { photo: o.intro.photo, sec: o.intro.sec } : null,
    outro: o.outro && o.outro.on ? { target: o.outro.target, down: o.outro.down, bg: o.outro.bg } : null });
  return { ...r, extended: true };
}
module.exports = { plan, naturePhoto: W.naturePhoto, parseTime: W.parseTime, mmss: W.mmss, pexelsKey: W.pexelsKey };
