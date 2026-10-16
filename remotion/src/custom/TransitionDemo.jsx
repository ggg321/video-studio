import React from 'react';
import { AbsoluteFill } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { glitch, rgbSplit, zoomBlur, lightLeak, clockWipe, pixelate, checkerboard } from '../lib/transitions';

// Shows every transition we have, one after another, so a request can point at it by name ("like the glitch one").
const LIST = [
  ['fade', () => fade()], ['slide', () => slide()], ['glitch', () => glitch()], ['rgbSplit', () => rgbSplit()], ['zoomBlur', () => zoomBlur()],
  ['lightLeak', () => lightLeak()], ['clockWipe', () => clockWipe({ width: 720, height: 1280 })], ['pixelate', () => pixelate()], ['checkerboard', () => checkerboard()]
];
const COLORS = ['#10141a', '#1a1030', '#0b2a2a', '#2a1410'];

const Card = ({ title, sub, bg }) => (
  <AbsoluteFill style={{ background: bg, justifyContent: 'center', alignItems: 'center', color: '#fff', fontFamily: 'Montserrat, sans-serif', textAlign: 'center' }}>
    <div style={{ fontSize: 90, fontWeight: 800, fontStyle: 'italic', textTransform: 'uppercase' }}>{title}</div>
    <div style={{ fontSize: 34, opacity: 0.7, marginTop: 10 }}>{sub}</div>
  </AbsoluteFill>
);

export const TransitionDemo = () => {
  const items = [];
  LIST.forEach(([name, make], i) => {
    items.push(<TransitionSeries.Sequence key={'s' + i} durationInFrames={50}><Card title={i ? LIST[i - 1][0] : 'start'} sub={i ? 'then →' : 'transition demo'} bg={COLORS[i % COLORS.length]} /></TransitionSeries.Sequence>);
    items.push(<TransitionSeries.Transition key={'t' + i} presentation={make()} timing={linearTiming({ durationInFrames: 20 })} />);
  });
  items.push(<TransitionSeries.Sequence key="end" durationInFrames={50}><Card title={LIST[LIST.length - 1][0]} sub="end" bg={COLORS[LIST.length % COLORS.length]} /></TransitionSeries.Sequence>);
  return <TransitionSeries>{items}</TransitionSeries>;
};
export const transitionDemo = { id: 'TransitionDemo', component: TransitionDemo, width: 720, height: 1280, fps: 30, durationInFrames: 50 * (LIST.length + 1) - 20 * LIST.length };
