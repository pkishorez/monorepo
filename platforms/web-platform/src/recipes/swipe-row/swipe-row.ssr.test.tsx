import { renderToString } from 'react-dom/server';
import { expect, it } from 'vitest';
import { GestureProvider, GestureZone } from '../../ui/input/index.ts';
import { SwipeRow } from './swipe-row.tsx';

// On the server there is no window: a row draws as it would at rest.
it('draws on the server', () => {
  const html = renderToString(
    <GestureProvider>
      <GestureZone>
        <SwipeRow direction="right" label="Settle" onSwipe={() => {}}>
          A session
        </SwipeRow>
      </GestureZone>
    </GestureProvider>,
  );
  expect(html).toContain('A session');
  expect(html).toContain('Settle');
});
