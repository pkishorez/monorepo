import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PwaProvider } from '../../react/index.js';
import { UpdatePrompt } from '../index.js';

const ssr = (child: ReturnType<typeof createElement>) =>
  renderToString(createElement(PwaProvider, null, child));

describe('ui during SSR', () => {
  it('UpdatePrompt renders no toast while Idle', () => {
    expect(ssr(createElement(UpdatePrompt))).not.toContain('new version');
  });
});
