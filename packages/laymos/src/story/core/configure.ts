import { setMode } from './tracer.js';
import type { StoryMode } from './types.js';

export function configureStory(options: { mode: StoryMode }): void {
  setMode(options.mode);
}
