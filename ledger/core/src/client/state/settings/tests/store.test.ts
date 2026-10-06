import { Effect } from 'effect';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { describe, expect, it } from 'vitest';
import { settingsTable } from '../../../domain/settings/index.ts';
import { openSettings } from '../index.ts';

// Lets the Collection write to the table.
const settled = () => Effect.runPromise(Effect.sleep('50 millis'));

describe("this device's Settings", () => {
  it('keeps what is stored when a change comes before it is read', async () => {
    const table = Memory.make(settingsTable).layer;
    const first = openSettings(table);
    first.change({ haptics: false, sound: false });
    await settled();
    expect(await first.read()).toMatchObject({ haptics: false, sound: false });

    // A new launch changes the Backend before its Collection has read them.
    const next = openSettings(table);
    next.change({ backend: 'local' });
    await settled();
    expect(await next.read()).toMatchObject({
      backend: 'local',
      haptics: false,
      sound: false,
    });
  });
});
