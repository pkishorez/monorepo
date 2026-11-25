import { describe, expect, it } from 'vitest';
import type { Event } from '../../../../video/library/schema.ts';
import { logLines, textOf } from '../log.ts';

const at = (second: number) =>
  new Date(2026, 10, 25, 9, 0, second).toISOString();

describe('logLines', () => {
  it('prints the label or step, padded, then the text or the percent', () => {
    const lines = logLines([
      { at: at(1), step: 'info', text: 'A Talk · A Channel · 1:00' },
      {
        at: at(2),
        step: 'clean-up',
        label: 'filler talk',
        text: 'cut 00:00:40–00:00:43  weather',
      },
      { at: at(3), step: 'download', progress: 0.29 },
    ]);
    expect(lines.map(textOf)).toEqual([
      '09:00:01  info          A Talk · A Channel · 1:00',
      '09:00:02  filler talk   cut 00:00:40–00:00:43  weather',
      '09:00:03  download      29%',
    ]);
  });

  it('folds consecutive progress of one step into one line, the latest', () => {
    const events: Array<Event> = [
      { at: at(1), step: 'download', progress: 0.01 },
      { at: at(2), step: 'download', progress: 0.02 },
      { at: at(3), step: 'download', progress: 1 },
      { at: at(4), step: 'transcribe', progress: 0.1 },
      { at: at(5), step: 'transcribe', text: '[00:00:00] Hello.' },
      { at: at(6), step: 'transcribe', progress: 0.2 },
      { at: at(7), step: 'transcribe', progress: 0.3 },
    ];
    const lines = logLines(events);
    expect(lines.map(textOf)).toEqual([
      '09:00:03  download      100%',
      '09:00:04  transcribe    10%',
      '09:00:05  transcribe    [00:00:00] Hello.',
      '09:00:07  transcribe    30%',
    ]);
    expect(lines.map((line) => line.key)).toEqual([0, 3, 4, 5]);
  });
});
