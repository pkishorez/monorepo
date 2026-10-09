// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { ProjectEntry } from '../../rpc/index.js';
import { MissingProjectState } from './missing-project.js';
import { ProjectPicker } from './project-picker.js';

const registry = vi.hoisted(() => ({
  entries: [] as ProjectEntry[],
  add: vi.fn(async (_input: { path: string; label: string | null }) => {}),
  update: vi.fn(
    async (_input: { id: string; path: string; label: string | null }) => {},
  ),
  remove: vi.fn((_id: string) => {}),
}));

vi.mock('./registry.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./registry.js')>()),
  useProjectRegistry: () => ({
    query: { isPending: false, error: null, data: registry.entries },
    add: { isPending: false, mutateAsync: registry.add },
    update: { isPending: false, mutateAsync: registry.update },
    remove: { mutate: registry.remove },
  }),
}));

const worktree = (root: string, branch: string, primary: boolean) => ({
  root,
  branch,
  head: '0123456789abcdef',
  primary,
  siblingPath: `${root}/devtools/laymos`,
  present: true,
});

const laymos: ProjectEntry = {
  id: 'laymos',
  path: '/work/repo/devtools/laymos',
  label: null,
  addedAt: 1,
  worktrees: {
    repositoryPath: 'devtools/laymos',
    current: '/work/repo',
    worktrees: [
      worktree('/work/repo', 'main', true),
      worktree('/work/repo-feature', 'feature-x', false),
    ],
  },
};

const repo: ProjectEntry = {
  id: 'repo',
  path: '/work/other',
  label: 'Other repo',
  addedAt: 2,
  worktrees: null,
};

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  registry.entries = [laymos, repo];
  registry.add.mockClear();
  registry.update.mockClear();
  registry.remove.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (candidate) =>
      candidate.getAttribute('aria-label') === name ||
      candidate.textContent?.trim() === name,
  );
  if (!found) throw new Error(`No button named ${name}.`);
  return found;
}

async function click(element: HTMLElement) {
  await act(async () => element.click());
  await settle();
}

function dialog(title: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(
    (candidate) => candidate.textContent?.includes(title),
  );
}

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

test('lists each entry by its own folder, with no worktree rows, and opens it', async () => {
  const onSelect = vi.fn();
  await act(async () =>
    root.render(<ProjectPicker currentPath={null} onSelect={onSelect} />),
  );

  expect(container.textContent).toContain('laymos');
  expect(container.textContent).toContain('Other repo');
  expect(container.textContent).not.toContain('feature-x');
  expect(container.querySelectorAll('li')).toHaveLength(2);
  expect(container.querySelector('button[aria-label^="Edit"]')).toBeNull();
  expect(container.querySelector('button[aria-label^="Remove"]')).toBeNull();

  const row = [...container.querySelectorAll('li')].find((item) =>
    item.textContent?.includes('Other repo'),
  )!;
  await click(row.querySelector('button')!);
  expect(onSelect).toHaveBeenCalledWith('/work/other');
});

test('Add opens its own dialog with the path field', async () => {
  await act(async () =>
    root.render(<ProjectPicker currentPath={null} onSelect={() => {}} />),
  );
  expect(dialog('Add to Monoverse')).toBeUndefined();

  await click(button('Add'));
  const add = dialog('Add to Monoverse')!;
  expect(add).toBeDefined();
  await type(add.querySelector<HTMLInputElement>('#add-path')!, '/work/new');
  await click(
    [...add.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Add',
    )!,
  );
  expect(registry.add).toHaveBeenCalledWith({ path: '/work/new', label: null });
  expect(dialog('Add to Monoverse')).toBeUndefined();
});

test('Manage lists the worktrees, and one opens the entry there', async () => {
  const onSelect = vi.fn();
  await act(async () =>
    root.render(
      <ProjectPicker
        currentPath="/work/repo/devtools/laymos"
        onSelect={onSelect}
      />,
    ),
  );

  await click(button('Manage laymos'));
  const manage = dialog('Worktrees')!;
  expect(manage.textContent).toContain('main');
  expect(manage.textContent).toContain('Edit');
  expect(
    manage.querySelector<HTMLInputElement>('#edit-laymos-path')!.value,
  ).toBe('/work/repo/devtools/laymos');

  await click(
    [...manage.querySelectorAll('button')].find((candidate) =>
      candidate.textContent?.includes('feature-x'),
    )!,
  );
  expect(onSelect).toHaveBeenCalledWith('/work/repo-feature/devtools/laymos');
});

test('Remove asks first, and removes only once confirmed', async () => {
  await act(async () =>
    root.render(<ProjectPicker currentPath={null} onSelect={() => {}} />),
  );

  await click(button('Manage Other repo'));
  await click(button('Remove'));
  const confirm = document.querySelector<HTMLElement>('[role="alertdialog"]')!;
  expect(confirm.textContent).toContain('Remove Other repo from Monoverse?');
  expect(confirm.textContent).toContain('The folder stays on your disk.');
  expect(confirm.textContent).not.toMatch(/delete/i);
  expect(registry.remove).not.toHaveBeenCalled();

  await click(
    [...confirm.querySelectorAll('button')].find(
      (candidate) => candidate.textContent === 'Remove',
    )!,
  );
  expect(registry.remove).toHaveBeenCalledWith('repo');
});

test('a folder missing from this checkout says so, and Edit opens its Manage dialog', async () => {
  await act(async () =>
    root.render(
      <MissingProjectState
        path="/work/repo/devtools/laymos"
        resolution={laymos.worktrees}
        onSelect={() => {}}
      />,
    ),
  );

  expect(container.textContent).toContain(
    "This checkout doesn't contain devtools/laymos.",
  );
  expect(container.textContent).toContain(
    'Edit the entry to point at the right folder.',
  );

  await click(button('Edit'));
  expect(
    document.querySelector<HTMLInputElement>('#edit-laymos-path')?.value,
  ).toBe('/work/repo/devtools/laymos');
});
