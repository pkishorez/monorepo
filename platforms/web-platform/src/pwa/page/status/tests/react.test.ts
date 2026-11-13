import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PwaProvider, usePwa } from '../index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hooks during SSR', () => {
  it('render the documented defaults without touching window', () => {
    const Probe = () => usePwa().status._tag;
    const html = renderToString(
      createElement(PwaProvider, null, createElement(Probe)),
    );
    expect(html).toBe('Unsupported');
  });
});

describe('usePwa', () => {
  it('reports the version the server rendered into the head', () => {
    vi.stubGlobal('document', {
      querySelector: (selector: string) =>
        selector.includes('build-id')
          ? { getAttribute: () => 'from-dom' }
          : null,
    });
    const Probe = () => JSON.stringify(usePwa().version);
    expect(renderToString(createElement(Probe))).toBe(
      JSON.stringify({
        buildId: 'from-dom',
        builtAt: null,
        commit: null,
      }).replaceAll('"', '&quot;'),
    );
  });
});
