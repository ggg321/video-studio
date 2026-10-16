import React, { useLayoutEffect, useRef, createContext, useContext } from 'react';
import { AbsoluteFill, Sequence, OffthreadVideo, Audio, Loop, useCurrentFrame, useVideoConfig, interpolate, Easing, Img } from 'remotion';
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';
import { Particles, Spawner, Behavior, StaggeredMotion } from 'remotion-bits';

gsap.registerPlugin(SplitText, DrawSVGPlugin, MorphSVGPlugin);

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };
const ease = Easing.out(Easing.cubic);
const hexA = (hex, a) => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const clean = w => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// anim: how text appears (blur | gsap | split); fx: extras (underline, morph, particles)
const FxCtx = createContext({ anim: 'blur', fx: {} });

// A GSAP timeline is built once, paused, and moved to the current frame, so every frame renders the same way whichever worker draws it.
function useTimeline(build, deps, at = 0) {
  const frame = useCurrentFrame(), { fps } = useVideoConfig();
  const tl = useRef(null);
  useLayoutEffect(() => { const r = build(); tl.current = r.tl; return () => { r.tl.kill(); if (r.cleanup) r.cleanup(); }; }, deps);
  useLayoutEffect(() => { if (tl.current) tl.current.time(Math.max(0, (frame - at) / fps), false); }, [frame, at, fps, ...deps]);
}

// GSAP version of one word: every letter springs in (back ease, stagger)
const GsapWord = ({ text, at, accent, color, size, glow }) => {
  const root = useRef(null);
  useTimeline(() => {
    const els = root.current ? root.current.querySelectorAll('.ch') : [];
    const tl = gsap.timeline({ paused: true });
    tl.fromTo(els, { opacity: 0, y: 70, rotation: 9, scale: 0.6, filter: 'blur(14px)' }, { opacity: 1, y: 0, rotation: 0, scale: 1, filter: 'blur(0px)', duration: 0.5, ease: 'back.out(2.2)', stagger: 0.035 }, 0);
    return { tl };
  }, [text], at);
  return <span ref={root} style={{ display: 'inline-block', margin: '0 .14em', whiteSpace: 'nowrap', color: accent ? accent : color, textShadow: accent && glow ? `0 0 ${size * 0.35}px ${hexA(accent, 0.55)}` : 'none' }}>
    {Array.from(text).map((c, i) => <span key={i} className="ch" style={{ display: 'inline-block', opacity: 0 }}>{c}</span>)}</span>;
};

// blur version of one word
const BlurWord = ({ text, at, accent, color, size, glow, dur = 9 }) => {
  const f = useCurrentFrame() - at;
  const p = interpolate(f, [0, dur], [0, 1], { ...clamp, easing: ease });
  const style = { display: 'inline-block', margin: '0 .14em', opacity: p, filter: `blur(${(1 - p) * 18}px)`, transform: `translateY(${(1 - p) * 26}px) scale(${0.92 + 0.08 * p})`,
    color: accent ? accent : color, textShadow: accent && glow ? `0 0 ${size * 0.35}px ${hexA(accent, 0.55)}` : 'none' };
  return <span style={style}>{text}</span>;
};
const Word = props => { const { anim } = useContext(FxCtx); return anim === 'gsap' ? <GsapWord {...props} /> : <BlurWord {...props} />; };

const textBase = (size, family) => ({ fontFamily: family, fontWeight: 800, fontStyle: 'italic', fontSize: size, lineHeight: 1.04, letterSpacing: '-0.02em', textTransform: 'uppercase', textAlign: 'center' });

// whole text block with GSAP SplitText: lines rise from a mask, letters follow. `lines` = array of word arrays, `hlSet` = words that get the accent colour
const SplitBlock = ({ lines, hlSet, accent, color, size, family, glow, at = 2 }) => {
  const root = useRef(null);
  const key = lines.map(l => l.join(' ')).join('|');
  useTimeline(() => {
    const el = root.current, tl = gsap.timeline({ paused: true });
    const sp = SplitText.create(el, { type: 'lines,words,chars', mask: 'lines', linesClass: 'ln', wordsClass: 'ww', charsClass: 'cc' });
    tl.fromTo(sp.chars, { yPercent: 115, rotation: 7, opacity: 0, filter: 'blur(10px)' }, { yPercent: 0, rotation: 0, opacity: 1, filter: 'blur(0px)', duration: 0.55, ease: 'power4.out', stagger: { each: 0.022, from: 'start' } }, 0);
    return { tl, cleanup: () => sp.revert() };
  }, [key], at);
  return <div ref={root} style={{ ...textBase(size, family), color }}>
    {lines.map((ws, li) => <div key={li}>{ws.map((w, wi) => <React.Fragment key={wi}>{wi ? ' ' : ''}<span style={hlSet.has(clean(w)) ? { color: accent, textShadow: glow ? `0 0 ${size * 0.35}px ${hexA(accent, 0.55)}` : 'none' } : undefined}>{w}</span></React.Fragment>)}</div>)}
  </div>;
};

// hand-drawn underline drawn with DrawSVG
const Underline = ({ accent, at = 8, width, height, thick = 6 }) => {
  const ref = useRef(null);
  useTimeline(() => {
    const tl = gsap.timeline({ paused: true });
    tl.fromTo(ref.current, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.5, ease: 'power2.inOut' }, 0);
    return { tl };
  }, [], at);
  return <svg width={width} height={height} viewBox="0 0 300 24" preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible', filter: `drop-shadow(0 0 10px ${hexA(accent, 0.6)})` }}>
    <path ref={ref} d="M4 14 C 50 4, 90 20, 140 10 S 230 6, 296 12" fill="none" stroke={accent} strokeWidth={thick} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
  </svg>;
};

// a slowly morphing outline behind the text (circle -> star -> rounded square)
const SHAPES = [
  'M150 10 C 230 10 290 70 290 150 C 290 230 230 290 150 290 C 70 290 10 230 10 150 C 10 70 70 10 150 10 Z',
  'M150 8 L 186 108 L 292 112 L 208 176 L 238 280 L 150 220 L 62 280 L 92 176 L 8 112 L 114 108 Z',
  'M60 14 L 240 14 C 276 14 286 24 286 60 L 286 240 C 286 276 276 286 240 286 L 60 286 C 24 286 14 276 14 240 L 14 60 C 14 24 24 14 60 14 Z'
];
const MorphShape = ({ accent, theme, W, H }) => {
  const ref = useRef(null);
  const { durationInFrames, fps } = useVideoConfig();
  const D = durationInFrames / fps;
  useTimeline(() => {
    const tl = gsap.timeline({ paused: true });
    gsap.set(ref.current, { attr: { d: SHAPES[0] } });
    tl.to(ref.current, { morphSVG: SHAPES[1], duration: Math.max(0.4, D / 2), ease: 'power2.inOut' }, 0).to(ref.current, { morphSVG: SHAPES[2], duration: Math.max(0.4, D / 2), ease: 'power2.inOut' });
    return { tl };
  }, [D]);
  const f = useCurrentFrame(), s = Math.min(W, H) * 0.95;
  return <svg width={s} height={s} viewBox="0 0 300 300" style={{ position: 'absolute', left: (W - s) / 2, top: (H - s) / 2, transform: `rotate(${f * 0.4}deg)`, opacity: 0.55, overflow: 'visible' }}>
    <path ref={ref} d={SHAPES[0]} fill="none" stroke={theme === 'light' ? 'rgba(20,20,24,.35)' : hexA(accent, 0.55)} strokeWidth={3} vectorEffect="non-scaling-stroke" />
  </svg>;
};

// floating glow dots (Remotion Bits particle system)
const Dots = ({ accent, W, H, dark }) => (
  <Particles startFrame={60} style={{ position: 'absolute', inset: 0 }}>
    <Spawner rate={0.35} max={120} area={{ width: W, height: H }} position={{ x: W / 2, y: H / 2 }} lifespan={90} lifespanVariance={30} velocity={{ x: 0.2, y: -0.7, varianceX: 0.6, varianceY: 0.4 }}>
      <StaggeredMotion transition={{ opacity: [0, 1, 0] }}>
        <div style={{ width: W * 0.012, height: W * 0.012, borderRadius: '50%', backgroundColor: dark ? accent : '#222', boxShadow: dark ? `0 0 ${W * 0.03}px ${W * 0.008}px ${hexA(accent, 0.6)}` : 'none' }} />
      </StaggeredMotion>
    </Spawner>
    <Behavior wiggle={{ magnitude: 1.4, frequency: 0.08 }} wiggleVariance={0.8} />
  </Particles>
);

// flowing stripes background (dark or light), moves with the frame
const Waves = ({ theme, accent }) => {
  const f = useCurrentFrame(), { width: W, height: H } = useVideoConfig();
  const dark = theme !== 'light';
  const lines = [];
  const N = 26;
  for (let i = 0; i < N; i++) {
    const y0 = (i / (N - 1)) * H * 1.2 - H * 0.1, amp = 40 + 38 * Math.sin(i * 0.7), ph = i * 0.5 + f * 0.035, k = 0.0085 + 0.0016 * Math.cos(i * 0.4);
    let d = '';
    for (let x = 0; x <= W + 20; x += 20) { const y = y0 + amp * Math.sin(x * k + ph) + 30 * Math.sin(x * k * 2.3 - ph * 1.4 + i); d += (x ? 'L' : 'M') + x + ' ' + y.toFixed(1); }
    const glow = Math.max(0, Math.sin(i * 0.5 + f * 0.02)) ** 2;
    lines.push(<path key={i} d={d} fill="none" stroke={dark ? hexA(accent, 0.05 + 0.35 * glow) : `rgba(20,20,24,${0.08 + 0.4 * glow})`} strokeWidth={dark ? 2 + (i % 3) : 3 + (i % 4)} />);
  }
  const bg = dark ? `radial-gradient(120% 80% at 50% 55%, ${hexA(accent, 0.18)} 0%, #04110f 55%, #020807 100%), #020807` : 'radial-gradient(120% 90% at 50% 50%, #ffffff 0%, #eceef0 100%)';
  return <AbsoluteFill style={{ background: bg }}><svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>{lines}</svg></AbsoluteFill>;
};

// text + optional DrawSVG underline under it
const TextBlock = ({ lines, hl, accent, color, size: size0, family, glow, underline, at = 2 }) => {
  const { anim } = useContext(FxCtx), { width: VW } = useVideoConfig();
  const size = Math.min(size0, (VW * 0.88) / (Math.max(1, ...lines.flat().map(w => w.length)) * 0.74));   // a long word must fit the frame
  const hlSet = new Set(hl.map(clean));
  let k = 0;
  const wordsTotal = lines.reduce((n, l) => n + l.length, 0);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {anim === 'split'
        ? <SplitBlock lines={lines} hlSet={hlSet} accent={accent} color={color} size={size} family={family} glow={glow} at={at} />
        : <div style={{ ...textBase(size, family), color }}>{lines.map((ws, li) => <div key={li}>{ws.map((w, wi) => <Word key={wi} text={w} at={at + (k++) * 3} accent={hlSet.has(clean(w)) ? accent : null} color={color} size={size} glow={glow} />)}</div>)}</div>}
      {underline ? <div style={{ position: 'absolute', left: '8%', right: '8%', bottom: -size * 0.12 }}><Underline accent={accent} at={at + wordsTotal * 3 + 4} width="100%" height={size * 0.22} thick={Math.max(3, size * 0.05)} /></div> : null}
    </div>
  );
};

// full-screen text scene: words stagger in, words listed in `hl` get the accent colour
const TextScene = ({ s, accent, family, size0 }) => {
  const { fx } = useContext(FxCtx), { width: W, height: H } = useVideoConfig();
  const dark = s.theme !== 'light';
  const size = size0 * (s.size || 1);
  return (
    <AbsoluteFill>
      <Waves theme={s.theme} accent={accent} />
      {fx.morph ? <MorphShape accent={accent} theme={s.theme} W={W} H={H} /> : null}
      {fx.particles ? <Dots accent={accent} W={W} H={H} dark={dark} /> : null}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: size0 * 0.5 }}>
        <TextBlock lines={s.lines.map(ln => ln.split(/\s+/).filter(Boolean))} hl={s.hl || []} accent={accent} color={dark ? '#fff' : '#111'} size={size} family={family} glow={dark} underline={fx.underline} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// phone / monitor frame with a picture or video inside, floating slightly over the wave background
const DeviceScene = ({ s, accent, family }) => {
  const { fx } = useContext(FxCtx);
  const f = useCurrentFrame(), { width: W, height: H, durationInFrames: D } = useVideoConfig();
  const p = interpolate(f, [0, 14], [0, 1], { ...clamp, easing: ease });
  const phone = s.device !== 'monitor';
  const bw = phone ? W * 0.68 : W * 0.9, bh = phone ? bw * 2.05 : bw * 0.62;
  const sc = Math.min(1, (H * 0.84) / bh);
  const isVid = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(s.src || '');
  const drift = interpolate(f, [0, D], [0, 1]);
  const inner = s.src ? (isVid ? <OffthreadVideo src={s.src} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    : <Img src={s.src} style={{ width: '100%', height: '100%', objectFit: s.fit || 'cover', objectPosition: `50% ${(s.y == null ? 0 : s.y) * 100}%` }} />) : null;
  return (
    <AbsoluteFill>
      <Waves theme={s.theme || 'dark'} accent={accent} />
      {fx.particles ? <Dots accent={accent} W={W} H={H} dark /> : null}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', perspective: 1600 }}>
        <div style={{ width: bw, height: bh, opacity: p, transform: `scale(${sc * (0.9 + 0.1 * p + 0.03 * drift)}) rotateY(${(1 - p) * 14 - 4 + drift * 8}deg) rotateX(${3 - drift * 5}deg) translateY(${(1 - p) * 60}px)`,
          borderRadius: phone ? bw * 0.13 : bw * 0.025, background: '#0b0c0e', padding: phone ? bw * 0.03 : bw * 0.018, boxShadow: `0 40px 120px rgba(0,0,0,.55), 0 0 0 2px #2a2d33, 0 0 90px ${hexA(accent, 0.28)}` }}>
          <div style={{ width: '100%', height: '100%', borderRadius: phone ? bw * 0.105 : bw * 0.012, overflow: 'hidden', background: '#111', position: 'relative' }}>
            {inner}
            {phone ? <div style={{ position: 'absolute', top: bw * 0.025, left: '50%', transform: 'translateX(-50%)', width: bw * 0.24, height: bw * 0.07, borderRadius: bw * 0.05, background: '#000' }} /> : null}
          </div>
        </div>
      </AbsoluteFill>
      {s.caption ? <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: H * 0.06 }}><div style={{ ...textBase(W * 0.07, family), color: '#fff', textTransform: 'none' }}>{s.caption}</div></AbsoluteFill> : null}
    </AbsoluteFill>
  );
};

// a clip prepared elsewhere (a HyperFrames carousel): square picture in the middle on its own background
const ClipScene = ({ s }) => {
  const f = useCurrentFrame(), p = interpolate(f, [0, 8], [0, 1], clamp);
  if (s.alpha) return <AbsoluteFill style={{ opacity: p }}><OffthreadVideo src={s.src} muted transparent style={{ width: '100%', height: '100%', objectFit: s.fit || 'contain', objectPosition: '50% 100%' }} /></AbsoluteFill>;
  return <AbsoluteFill style={{ background: s.bg || '#06100f', opacity: p }}>
    <OffthreadVideo src={s.src} muted style={{ width: '100%', height: '100%', objectFit: s.fit || 'contain' }} />
  </AbsoluteFill>;
};

// keyword over the speaker: appears at its word, stays, blurs out
const Keyword = ({ k, accent, family, W, H, durationInFrames }) => {
  const { anim, fx } = useContext(FxCtx);
  const f = useCurrentFrame();
  const out = interpolate(f, [durationInFrames - 6, durationInFrames], [1, 0], clamp);
  const ws = k.text.split(/\s+/).filter(Boolean);
  // a long word must fit the width of the frame
  const size = Math.min(W * (k.size || 0.105), (W * 0.88) / (Math.max(1, ...ws.map(w => w.length)) * 0.74));
  const top = k.pos === 'center' ? H * 0.36 : k.pos === 'low' ? H * 0.66 : H * 0.12;
  const hl = k.accent === 'none' ? [] : k.accent === 'all' ? ws : [ws[ws.length - 1]];
  return (
    <AbsoluteFill style={{ opacity: out, filter: `blur(${(1 - out) * 10}px)` }}>
      <div style={{ position: 'absolute', left: W * 0.05, right: W * 0.05, top, textAlign: 'center', textShadow: '0 6px 30px rgba(0,0,0,.55)' }}>
        {anim === 'split' || fx.underline
          ? <TextBlock lines={[ws]} hl={hl} accent={accent} color="#fff" size={size} family={family} glow underline={fx.underline} at={0} />
          : <div style={{ ...textBase(size, family), color: '#fff' }}>{ws.map((w, i) => <Word key={i} text={w} at={i * 3} accent={hl.includes(w) ? accent : null} color="#fff" size={size} glow dur={8} />)}</div>}
      </div>
    </AbsoluteFill>
  );
};

const Flash = ({ len = 7, color = '#fff' }) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ background: color, opacity: interpolate(f, [0, 1, len], [0, 0.9, 0], clamp), pointerEvents: 'none' }} />;
};

export const Typo = ({ video, audio, presenterDur, accent, fontUrl, fontFamily, scenes, keywords, flashes, duration, anim, fx, overlay }) => {
  const { width: W, height: H, fps } = useVideoConfig();
  const fam = fontUrl ? 'VSFont' : fontFamily;
  const sec = t => Math.round(t * fps);
  // light motion: only the animated words (and particles) on a transparent background, laid over the normal video afterwards
  if (overlay) return (
    <FxCtx.Provider value={{ anim: anim || 'blur', fx: fx || {} }}>
      <AbsoluteFill style={{ background: 'transparent', fontFamily: fam }}>
        {fontUrl ? <style>{`@font-face{font-family:'VSFont';src:url('${fontUrl}');font-weight:100 900;font-style:normal}`}</style> : null}
        {fx && fx.particles ? <Dots accent={accent} W={W} H={H} dark /> : null}
        {keywords.map((k, i) => { const d = Math.max(8, sec(k.end - k.start)); return <Sequence key={'k' + i} from={sec(k.start)} durationInFrames={d} layout="none"><Keyword k={k} accent={accent} family={fam} W={W} H={H} durationInFrames={d} /></Sequence>; })}
      </AbsoluteFill>
    </FxCtx.Provider>
  );
  const vstyle = { width: '100%', height: '100%', objectFit: 'cover' };
  const base = video ? (presenterDur > 0 && presenterDur < duration - 0.1
    ? <Loop durationInFrames={Math.max(1, sec(presenterDur))}><OffthreadVideo src={video} muted style={vstyle} /></Loop>
    : <OffthreadVideo src={video} muted style={vstyle} />) : <AbsoluteFill style={{ background: '#000' }} />;
  return (
    <FxCtx.Provider value={{ anim: anim || 'blur', fx: fx || {} }}>
      <AbsoluteFill style={{ background: '#000', fontFamily: fam }}>
        {fontUrl ? <style>{`@font-face{font-family:'VSFont';src:url('${fontUrl}');font-weight:100 900;font-style:normal}`}</style> : null}
        <AbsoluteFill>{base}</AbsoluteFill>
        {audio ? <Audio src={audio} /> : video ? <Audio src={video} /> : null}
        {keywords.map((k, i) => { const d = Math.max(8, sec(k.end - k.start)); return <Sequence key={'k' + i} from={sec(k.start)} durationInFrames={d} layout="none"><Keyword k={k} accent={accent} family={fam} W={W} H={H} durationInFrames={d} /></Sequence>; })}
        {scenes.map((s, i) => { const d = Math.max(6, sec(s.end - s.start)); return (
          <Sequence key={'s' + i} from={sec(s.start)} durationInFrames={d} layout="none">
            <AbsoluteFill>{s.kind === 'clip' ? <ClipScene s={s} /> : s.kind === 'device' ? <DeviceScene s={s} accent={accent} family={fam} /> : <TextScene s={s} accent={accent} family={fam} size0={W * 0.13} />}</AbsoluteFill>
          </Sequence>); })}
        {flashes ? scenes.filter(s => !(s.kind === 'clip' && s.alpha)).map((s, i) => <Sequence key={'f' + i} from={Math.max(0, sec(s.start) - 1)} durationInFrames={9} layout="none"><Flash color={s.theme === 'light' ? '#fff' : accent} /></Sequence>) : null}
      </AbsoluteFill>
    </FxCtx.Provider>
  );
};
