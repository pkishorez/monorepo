import { describe, expect } from 'vitest';
import {
  moreCoverageDomain,
  moreCoverageTest as it,
} from '../../../../laymos/more-coverage.js';

import { marshall, unmarshall } from '../index.js';

moreCoverageDomain('DynamoDB', () => {
  describe('Marshalling', () => {
    it('roundtrips nested scalar, list, map, null, and undefined values', () => {
      const value = {
        string: 'value',
        number: 42.5,
        boolean: false,
        nil: null,
        missing: undefined,
        list: ['a', 2, true, null],
        map: { nested: 'yes', count: 3 },
      };

      expect(unmarshall(marshall(value))).toEqual({
        string: 'value',
        number: 42.5,
        boolean: false,
        nil: null,
        missing: null,
        list: ['a', 2, true, null],
        map: { nested: 'yes', count: 3 },
      });
    });

    it('returns an empty record for non-object roots', () => {
      expect(marshall(null)).toEqual({});
      expect(marshall(undefined)).toEqual({});
      expect(marshall('value')).toEqual({});
      expect(marshall(42)).toEqual({});
    });

    it('decodes DynamoDB string, number, and binary sets', () => {
      expect(
        unmarshall({
          strings: { SS: ['a', 'b'] },
          numbers: { NS: ['1', '2.5'] },
          binary: { BS: ['YQ==', 'Yg=='] },
        }),
      ).toEqual({
        strings: ['a', 'b'],
        numbers: [1, 2.5],
        binary: ['YQ==', 'Yg=='],
      });
    });

    it('maps unsupported JavaScript values and unknown attributes to null', () => {
      expect(
        marshall({ symbol: Symbol('x'), function: () => undefined }),
      ).toEqual({
        symbol: { NULL: true },
        function: { NULL: true },
      });
      expect(unmarshall({ unknown: {} as never })).toEqual({ unknown: null });
    });
  });
});
