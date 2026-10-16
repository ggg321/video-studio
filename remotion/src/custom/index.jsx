// Compositions made on request. Add { id, component, width, height, fps, durationInFrames, defaultProps } here.
// Render one with: node render.js props.json out.mp4   (props.composition = id; render.js is in the folder above).
import { transitionDemo } from './TransitionDemo';
import { packDemo } from './PackDemo';

export const custom = [transitionDemo, packDemo];
