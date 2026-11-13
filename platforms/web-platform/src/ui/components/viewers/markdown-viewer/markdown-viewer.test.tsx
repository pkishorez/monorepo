// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownViewer } from './markdown-viewer.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const button = (name: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);

const FENCED = '```ts\nconst a = 1;\nconst b = 2;\n```';

describe('a code block', () => {
  it('copies its code, without the newline that ends it', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    act(() => root.render(<MarkdownViewer>{FENCED}</MarkdownViewer>));
    await act(async () => button('Copy the code')!.click());
    expect(writeText).toHaveBeenCalledWith('const a = 1;\nconst b = 2;');
    expect(button('Copied')).not.toBeNull();
  });

  it('says so when the clipboard refuses', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('denied')));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    act(() => root.render(<MarkdownViewer>{FENCED}</MarkdownViewer>));
    await act(async () => button('Copy the code')!.click());
    expect(button("Couldn't copy")).not.toBeNull();
  });

  it('says so where there is no clipboard', async () => {
    vi.stubGlobal('navigator', {});
    act(() => root.render(<MarkdownViewer>{FENCED}</MarkdownViewer>));
    await act(async () => button('Copy the code')!.click());
    expect(button("Couldn't copy")).not.toBeNull();
  });
});

describe('inline code', () => {
  it('has nothing to copy it', () => {
    act(() => root.render(<MarkdownViewer>{'Run `ls` first'}</MarkdownViewer>));
    expect(host.querySelector('code')?.textContent).toBe('ls');
    expect(host.querySelector('button')).toBeNull();
  });
});
