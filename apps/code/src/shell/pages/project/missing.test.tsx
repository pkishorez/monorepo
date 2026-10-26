// @vitest-environment jsdom
import { act, use } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Draft } from './draft/index.ts';
import { DraftFor, FolderMissing } from './missing.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * A project whose folder is missing says so above its Draft, with Remove
 * beside it, and its Draft sends nothing; one whose folder is there sends.
 */

let root: ReactRoot | undefined;

const draw = async (node: React.ReactNode) => {
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root!.render(node));
};

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

/** What the Draft is told by the page. */
function Probe() {
  const { blocked } = use(Draft.Slots);
  return <output>{blocked ? 'blocked' : 'sends'}</output>;
}

describe('a project whose folder is missing', () => {
  it('says the folder no longer exists, with Remove beside it', async () => {
    await draw(
      <FolderMissing
        path="/home/me/gone"
        remove={<button type="button">Remove project</button>}
      />,
    );
    const status = document.querySelector('[role="status"]');
    expect(status?.textContent).toContain(
      'The folder /home/me/gone no longer exists',
    );
    expect(status?.querySelector('button')?.textContent).toBe('Remove project');
  });

  it('blocks its Draft, so no new session starts', async () => {
    await draw(
      <DraftFor missing>
        <Probe />
      </DraftFor>,
    );
    expect(document.querySelector('output')?.textContent).toBe('blocked');
  });

  it('leaves the Draft of one whose folder is there to send', async () => {
    await draw(
      <DraftFor missing={false}>
        <Probe />
      </DraftFor>,
    );
    expect(document.querySelector('output')?.textContent).toBe('sends');
  });
});
