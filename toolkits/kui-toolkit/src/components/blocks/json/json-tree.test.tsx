import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { JsonTree } from './json-tree';

it('renders string values with foreground contrast', () => {
  const markup = renderToStaticMarkup(
    <JsonTree value={{ kind: 'webrtc.rpc-invocation' }} />,
  );

  expect(markup).toContain('--w-rjv-type-string-color:var(--foreground)');
});
