import React from 'react';
import { useCurrentFrame, useVideoConfig, AbsoluteFill } from 'remotion';
import { SkiaCanvas } from '@remotion/skia';
import { Circle as SkCircle, Group, BlurMask } from '@shopify/react-native-skia';

// loaded only after CanvasKit is ready (see PackDemo)
export default function SkiaPanel() {
  const f = useCurrentFrame(), { width: W, height: H } = useVideoConfig(), r = 150 + Math.sin(f / 7) * 40;
  return <AbsoluteFill style={{ background: '#0b0d12' }}><SkiaCanvas width={W} height={H}><Group><SkCircle cx={W / 2} cy={H / 2.3} r={r} color="#35c8ff"><BlurMask blur={40} style="normal" /></SkCircle><SkCircle cx={W / 2} cy={H / 2.3} r={r * 0.55} color="#ffffff" /></Group></SkiaCanvas></AbsoluteFill>;
}
