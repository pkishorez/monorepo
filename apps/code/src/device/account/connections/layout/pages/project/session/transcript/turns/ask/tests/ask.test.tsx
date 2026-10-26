// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { thread } from '../../rows/index.ts';
import { Ask } from '../ask.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/* A Turn Connect Resumed after a restart shows a marker, not its prompt. */

const PROMPT =
  'Connect restarted and cut off your last turn, possibly in the middle of a tool call.';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.body.appendChild(document.createElement('div'));
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('a Resumed Turn', () => {
  it('shows the marker in place of the prompt Connect sent', () => {
    const [row] = thread([
      {
        id: 'm1',
        sessionId: 's',
        turnId: 't1',
        agentId: null,
        role: 'user',
        parts: [
          { type: 'turnStarted', text: PROMPT, steered: false, resumed: true },
        ],
        at: 1,
      },
    ]);
    if (row?.kind !== 'turn') throw new Error('expected a turn row');
    act(() => root.render(<Ask row={row} />));
    expect(container.textContent).toContain('Resumed after Connect restarted');
    expect(container.textContent).not.toContain(PROMPT);
  });
});
