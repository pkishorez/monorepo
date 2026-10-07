import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  InstallPrompt,
  OfflineIndicator,
  useDisplayMode,
  useInstall,
  useOnline,
  useStoragePersistence,
} from '../index.js';

// No provider: every extra stands on its own.
const ssr = (component: () => ReturnType<typeof createElement> | string) =>
  renderToString(createElement(component));

describe('extras during SSR', () => {
  it('hooks render the documented defaults without touching window', () => {
    const Probe = () =>
      JSON.stringify({
        install: useInstall().state._tag,
        online: useOnline(),
        mode: useDisplayMode(),
        persisted: useStoragePersistence().persisted,
      });
    expect(JSON.parse(ssr(Probe).replaceAll('&quot;', '"'))).toEqual({
      install: 'Unsupported',
      online: true,
      mode: 'browser',
      persisted: null,
    });
  });

  it('InstallPrompt renders nothing while Unsupported', () => {
    expect(ssr(() => createElement(InstallPrompt))).toBe('');
  });

  it('OfflineIndicator renders an empty live region while online', () => {
    const html = ssr(() => createElement(OfflineIndicator));
    expect(html).toContain('role="status"');
    expect(html).not.toContain('offline');
    // Above the Sheet backdrop (z-50) of the InstallPrompt.
    expect(html).toContain('z-60');
  });
});
