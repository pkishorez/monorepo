import { renderToString } from 'react-dom/server';
import { expect, it } from 'vitest';
import { GestureProvider, GestureZone } from '../../../zones/index.ts';
import { usePullToRefresh } from '../index.ts';

function Probe() {
  const pull = usePullToRefresh({ onRefresh: () => {} });
  return <span>{pull.state}</span>;
}

// On the server there is no window: it is idle until a Gesture moves it.
it('draws on the server', () => {
  const html = renderToString(
    <GestureProvider>
      <GestureZone>
        <Probe />
      </GestureZone>
    </GestureProvider>,
  );
  expect(html).toContain('idle');
});
