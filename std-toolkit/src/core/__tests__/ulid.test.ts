import { Effect } from 'effect';
import { describe, expect } from 'vitest';
import {
  moreCoverageDomain,
  moreCoverageTest as it,
} from '../../../laymos/more-coverage.js';
import { Ulid, nextUlid, uTime } from '../ulid.js';

moreCoverageDomain('Core', () => {
  describe('nextUlid', () => {
    it('produces strictly ascending ULIDs, even within the same millisecond', async () => {
      const ids = await Effect.runPromise(
        Effect.gen(function* () {
          const out: string[] = [];
          for (let i = 0; i < 1_000; i++) out.push(yield* nextUlid);
          return out;
        }),
      );

      for (let i = 1; i < ids.length; i++) {
        expect(ids[i]! > ids[i - 1]!).toBe(true);
      }
    });

    it('embeds a decodable timestamp', async () => {
      const before = Date.now();
      const id = await Effect.runPromise(nextUlid);
      const after = Date.now();

      expect(uTime(id)).toBeGreaterThanOrEqual(before);
      expect(uTime(id)).toBeLessThanOrEqual(after);
    });

    it('uTime parses ISO timestamps and rejects other formats', () => {
      expect(uTime('2026-07-04T10:00:00.000Z')).toBe(
        Date.parse('2026-07-04T10:00:00.000Z'),
      );
      expect(uTime('')).toBeNull();
      expect(uTime('not-a-valid-u')).toBeNull();
    });

    it('honors an overridden generator', async () => {
      const id = await Effect.runPromise(
        nextUlid.pipe(Effect.provideService(Ulid, () => 'fixed-ulid')),
      );
      expect(id).toBe('fixed-ulid');
    });
  });
});
