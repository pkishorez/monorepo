import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PwaProvider, UpdatePrompt } from '../index.js';

const ssr = (child: ReturnType<typeof createElement>) =>
  renderToString(createElement(PwaProvider, null, child));

describe('UpdatePrompt during SSR', () => {
  it('UpdatePrompt renders no toast before the status is known', () => {
    expect(ssr(createElement(UpdatePrompt))).not.toContain('new version');
  });
});
