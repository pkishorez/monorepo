import { Effect } from 'effect';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { firstPlace, Panel } from '../bubble.tsx';
import type { Logged } from '../bubble.tsx';
import { FakeWorld } from '../index.ts';
import { garage, Weather, weather } from './fakes.ts';

/*
 * The bubble's panel drawn on a running Fake World, with no DOM: every
 * Fake, each Instance by its key with its State and Model, a labelled form
 * per Control its Actor takes, Start fresh, and the log.
 */

const sent: Logged = {
  at: 0,
  fake: 'Weather',
  to: 'Weather',
  message: '{"_tag":"StartRaining","heavy":true}',
  result: 'handled',
};

const drawn = () => {
  const world = FakeWorld.make([weather, garage]);
  return Effect.runPromise(
    Effect.gen(function* () {
      yield* Weather;
      const [sky, cars] = world.runtimes;
      sky!.runtime.root.send({ _tag: 'StartRaining', heavy: true });
      cars!.runtime.root.send({ _tag: 'AddCar', name: 'mini', color: 'red' });
      return renderToStaticMarkup(
        <Panel
          running={world.runtimes}
          log={[sent]}
          side="right"
          onSend={() => 'handled'}
          onStartFresh={() => {}}
          onClose={() => {}}
        />,
      );
    }).pipe(Effect.provide(world.layer)),
  );
};

describe('Panel', () => {
  it('draws every Fake, each Instance with its State and Model', async () => {
    const html = await drawn();
    expect(html).toContain('<h3>Weather</h3>');
    expect(html).toContain('<h3>Garage</h3>');
    expect(html).toMatch(/Weather<span class="tag" title="State">Raining/);
    expect(html).toMatch(/Car<span class="key"> mini<\/span>/);
    expect(html).toContain('<span class="string">&quot;mini&quot;</span>');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('Start fresh');
  });

  it('draws a labelled form per Control the Instance’s Actor takes', async () => {
    const html = await drawn();
    for (const words of [
      'Start raining',
      'Stop raining',
      'Set temperature',
      'Warn of a storm',
      'Add car',
      'Park',
      'Drive away',
    ])
      expect(html).toContain(`<summary>${words}</summary>`);
    expect(html).not.toContain('Observed');
    const label = /<label for="([^"]+)"[^>]*>color/.exec(html);
    expect(label).not.toBeNull();
    expect(html).toContain(`<select id="${label![1]}" name="color">`);
    expect(html).toContain('<option value="2">green</option>');
    expect(html).toMatch(/type="checkbox"/);
    expect(html).toMatch(/seats<span class="note"> \(optional\)/);
  });

  it('lists each Control sent, with what became of it', async () => {
    const html = await drawn();
    expect(html).toContain('Controls sent');
    expect(html).toContain('<span class="result handled">handled</span>');
    expect(html).toContain(sent.message.replaceAll('"', '&quot;'));
  });
});

describe('firstPlace', () => {
  it('sits on the right, clear of the bottom-right corner a Devtools Dock’s button holds', () => {
    // The Dock's button: 12 px from the right, 9 px from the foot, 36 px tall.
    const room = { width: 1440, height: 900 };
    const { x, y } = firstPlace(room);
    expect(x).toBe(1440 - 44 - 12);
    expect(y + 44).toBeLessThanOrEqual(900 - 9 - 36);
  });

  it('stays in a window too small to clear it', () => {
    expect(firstPlace({ width: 100, height: 80 })).toEqual({ x: 44, y: 12 });
  });
});
