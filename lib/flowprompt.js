// Builds ready-to-paste prompts (for Flow / Veo or any video generator) for the moments of a project that still have no fitting clip.
const DEFAULT_STYLE = 'Photorealistic cinematic stock footage, natural lighting, shallow depth of field, smooth slow camera movement.';
const WEAK = 0.55;   // clips with a semantic match below this are offered for replacement too

function build(p, niche, opts = {}) {
  const style = (opts.style || (niche.defaults || {}).promptStyle || DEFAULT_STYLE).trim();
  const vertical = (p.format || '').startsWith('vertical');
  const aspect = vertical ? 'Vertical 9:16 framing.' : 'Horizontal 16:9 framing (it will be cropped to the video format).';
  const out = [];
  (p.cuts || []).forEach((c, i) => {
    const card = c.clip === 'card', weak = c.sim != null && c.sim < WEAK && c.clip !== 'stock';
    if (!card && !weak) return;
    const scene = String(c.text || c.card || '').trim();
    if (!scene) return;
    out.push({
      i, start: c.start, end: c.end, text: scene, status: card ? 'no clip' : 'weak match', sim: c.sim,
      prompt: `${style} Scene illustrating: "${scene}". ${aspect} One continuous 4-6 second shot, no on-screen text, no logos or watermarks, no one speaking to the camera.`
    });
  });
  return out;
}
module.exports = { build, DEFAULT_STYLE };
