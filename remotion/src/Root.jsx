import React from 'react';
import { Composition } from 'remotion';
import { Typo } from './Typo';
import { custom } from './custom';

const DEF = { width: 720, height: 1280, fps: 30, duration: 10, video: null, audio: null, presenterDur: 0, accent: '#2dffc4', fontUrl: null, fontFamily: 'Montserrat',
  scenes: [], keywords: [], flashes: true, anim: 'blur', fx: {} };

export const Root = () => (
  <>
    {custom.map(c => <Composition key={c.id} {...c} />)}
    <Composition id="Typo" component={Typo} width={720} height={1280} fps={30} durationInFrames={300} defaultProps={DEF}
      calculateMetadata={({ props }) => ({ width: props.width, height: props.height, fps: props.fps, durationInFrames: Math.max(1, Math.round(props.duration * props.fps)) })} />
  </>
);
