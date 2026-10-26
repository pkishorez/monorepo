// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { FolderMissing } from './missing.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * A project whose folder is missing says so above its Draft, with Remove
 * beside it.
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
});
