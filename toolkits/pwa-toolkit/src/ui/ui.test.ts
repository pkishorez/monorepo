import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PwaProvider } from '../react/index.js';
import { InstallPrompt, OfflineIndicator, UpdatePrompt } from './index.js';

const ssr = (child: ReturnType<typeof createElement>) =>
  renderToString(createElement(PwaProvider, null, child));

describe('ui during SSR', () => {
  it('UpdatePrompt renders no toast while Idle', () => {
    expect(ssr(createElement(UpdatePrompt))).not.toContain('new version');
  });

  it('InstallPrompt renders nothing while Unsupported', () => {
    expect(ssr(createElement(InstallPrompt))).toBe('');
  });

  it('OfflineIndicator renders an empty live region while online', () => {
    const html = ssr(createElement(OfflineIndicator));
    expect(html).toContain('role="status"');
    expect(html).not.toContain('offline');
    // Above the Sheet backdrop (z-50) of the InstallPrompt.
    expect(html).toContain('z-60');
  });
});
