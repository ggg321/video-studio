import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, delayRender, continueRender } from 'remotion';
import { Trail } from '@remotion/motion-blur';
import { LightLeak } from '@remotion/light-leaks';
import { noise2D } from '@remotion/noise';
import { Star, Heart, Pie, Polygon, Circle } from '@remotion/shapes';
import { evolvePath } from '@remotion/paths';
import { loadFont } from '@remotion/google-fonts/Anton';
import { ThreeCanvas } from '@remotion/three';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

// One panel per library, so a request can say "like the motion blur one" or "like the Skia glow".
const { fontFamily } = loadFont();
const Label = ({ children }) => <div style={{ position: 'absolute', left: 0, right: 0, bottom: 60, textAlign: 'center', fontFamily, fontSize: 56, color: '#fff', letterSpacing: 2 }}>{children}</div>;
const Bg = ({ c = '#0b0d12', children }) => <AbsoluteFill style={{ background: c }}>{children}</AbsoluteFill>;

// the moving part must read the frame itself, inside Trail, so that every layer of the trail can be drawn at a slightly earlier time
const Mover = () => {
  const f = useCurrentFrame(), { width: W, height: H } = useVideoConfig();
  const x = interpolate(f, [0, 50], [W * 0.15, W * 0.85], { extrapolateRight: 'clamp' }), y = H * 0.4 + Math.sin(f / 6) * 120;
  return <AbsoluteFill><div style={{ position: 'absolute', left: x - 90, top: y - 90 }}><Star points={5} innerRadius={50} outerRadius={110} fill="#ffe600" /></div></AbsoluteFill>;
};
const Blur = () => <Bg><Trail layers={28} lagInFrames={0.25} trailOpacity={0.55}><Mover /></Trail><Label>motion-blur</Label></Bg>;
const Noise = () => {
  const f = useCurrentFrame(), { width: W, height: H } = useVideoConfig(), dots = [];
  for (let i = 0; i < 9; i++) for (let j = 0; j < 14; j++) { const n = noise2D('s', i * 0.3 + f * 0.02, j * 0.3); dots.push(<div key={i + '_' + j} style={{ position: 'absolute', left: j * (W / 14) + 10, top: 120 + i * 110 + n * 40, width: 34 + n * 24, height: 34 + n * 24, borderRadius: '50%', background: `hsl(${200 + n * 120},80%,60%)` }} />); }
  return <Bg>{dots}<Label>noise</Label></Bg>;
};
const Shapes = () => <Bg><div style={{ display: 'flex', gap: 60, justifyContent: 'center', alignItems: 'center', height: '100%', flexWrap: 'wrap', padding: 80 }}>
  <Star points={5} innerRadius={70} outerRadius={150} fill="#ffe600" /><Heart size={260} fill="#ff4fa3" /><Pie radius={140} progress={0.7} fill="#35c8ff" closePath /><Polygon points={6} radius={140} fill="#2dffc4" /><Circle radius={120} fill="none" stroke="#fff" strokeWidth={14} />
</div><Label>shapes</Label></Bg>;
const Paths = () => {
  const f = useCurrentFrame(), p = interpolate(f, [0, 45], [0, 1], { extrapolateRight: 'clamp' });
  const d = 'M 60 600 C 260 100, 460 1100, 660 520 S 900 300, 1020 700';
  const ev = evolvePath(p, d);
  return <Bg><svg width="1080" height="1280" viewBox="0 0 1080 1280"><path d={d} fill="none" stroke="#2a2f3d" strokeWidth="16" strokeLinecap="round" /><path d={d} fill="none" stroke="#ee7fc3" strokeWidth="16" strokeLinecap="round" strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} /></svg><Label>paths</Label></Bg>;
};
const Fonts = () => <Bg><div style={{ fontFamily, fontSize: 200, color: '#fff', textAlign: 'center', paddingTop: 420, lineHeight: 1 }}>GOOGLE<br />FONTS</div><Label>google-fonts (Anton)</Label></Bg>;
const Three = () => {
  const f = useCurrentFrame(), { width: W, height: H } = useVideoConfig();
  return <Bg><ThreeCanvas width={W} height={H} camera={{ position: [0, 0, 6], fov: 45 }}>
    <ambientLight intensity={0.6} /><directionalLight position={[3, 4, 5]} intensity={2} />
    <mesh rotation={[f / 18, f / 14, 0]}><boxGeometry args={[2, 2, 2]} /><meshStandardMaterial color="#ee7fc3" metalness={0.5} roughness={0.25} /></mesh>
  </ThreeCanvas><Label>three</Label></Bg>;
};
const Skia = () => <Bg><WithSkiaWeb opts={{ locateFile: f => '/' + f }} getComponent={() => import('./SkiaPanel')} fallback={<div />} /><Label>skia</Label></Bg>;
const Leaks = () => <Bg c="#101018"><LightLeak /><Label>light-leaks</Label></Bg>;

const PANELS = [Blur, Noise, Shapes, Paths, Fonts, Three, Skia, Leaks], D = 60;
export const PackDemo = () => <AbsoluteFill>{PANELS.map((P, i) => <Sequence key={i} from={i * D} durationInFrames={D}><P /></Sequence>)}</AbsoluteFill>;
export const packDemo = { id: 'PackDemo', component: PackDemo, width: 1080, height: 1280, fps: 30, durationInFrames: D * PANELS.length };
