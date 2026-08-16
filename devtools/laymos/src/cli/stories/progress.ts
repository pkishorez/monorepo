import * as colors from 'yoctocolors';

import type { StoryVerdict } from '../../story/schema/index.js';
import { countVerdict, emptyTally, renderTally } from './report.js';

export interface StoryProgress {
  readonly record: (verdict: StoryVerdict) => void;
  readonly stop: () => void;
}

export function startProgress(total: number): StoryProgress {
  const line = liveLine();
  if (line === null) return silentProgress;
  let tally = emptyTally;
  let frame = 0;
  const draw = () =>
    line.write(`${colors.cyan(spinner[frame]!)} ${renderTally(tally, total)}`);
  const ticker = setInterval(() => {
    frame = (frame + 1) % spinner.length;
    draw();
  }, frameMillis);
  ticker.unref();
  draw();
  return {
    record: (verdict) => {
      tally = countVerdict(tally, verdict);
      draw();
    },
    stop: () => {
      clearInterval(ticker);
      line.clear();
    },
  };
}

const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;
const frameMillis = 80;

const silentProgress: StoryProgress = { record: () => {}, stop: () => {} };

interface LiveLine {
  readonly write: (text: string) => void;
  readonly clear: () => void;
}

function liveLine(): LiveLine | null {
  const stream = process.stderr;
  if (!stream.isTTY) return null;
  const clear = () => {
    stream.clearLine(0);
    stream.cursorTo(0);
  };
  return {
    write: (text) => {
      clear();
      stream.write(text);
    },
    clear,
  };
}
