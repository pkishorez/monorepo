import * as Option from 'effect/Option';
import { describe, expect, it } from 'vitest';
import { BuildId } from '../build/index.js';
import {
  controlReply,
  isControlEnvelope,
  makeControlRequest,
  matchControlReply,
  matchControlRequest,
} from './index.js';

describe('Control Channel', () => {
  it('keeps the frozen wire shape', () => {
    expect(makeControlRequest('SKIP_WAITING')).toEqual({
      __pwaToolkit: 1,
      type: 'SKIP_WAITING',
    });
    expect(controlReply.buildId(BuildId.make('abc'))).toEqual({
      __pwaToolkit: 1,
      type: 'BUILD_ID',
      buildId: 'abc',
    });
  });

  it('matches its own requests', () => {
    for (const type of [
      'GET_BUILD_ID',
      'SKIP_WAITING',
      'CLEAR_RUNTIME_CACHE',
    ] as const) {
      expect(
        Option.getOrThrow(matchControlRequest(makeControlRequest(type))).type,
      ).toBe(type);
    }
  });

  it('ignores other traffic, unknown types and other versions', () => {
    expect(Option.isNone(matchControlRequest({ type: 'SKIP_WAITING' }))).toBe(
      true,
    );
    expect(
      Option.isNone(
        matchControlRequest({ __pwaToolkit: 1, type: 'NEW_THING' }),
      ),
    ).toBe(true);
    expect(
      Option.isNone(
        matchControlRequest({ __pwaToolkit: 2, type: 'SKIP_WAITING' }),
      ),
    ).toBe(true);
    expect(Option.isNone(matchControlRequest('SKIP_WAITING'))).toBe(true);
    expect(Option.isNone(matchControlRequest(null))).toBe(true);
    expect(isControlEnvelope({ __pwaToolkitRpc: 1 })).toBe(false);
  });

  it('matches replies but not requests as replies', () => {
    expect(Option.isSome(matchControlReply(controlReply.done()))).toBe(true);
    expect(Option.isSome(matchControlReply(controlReply.failed('x')))).toBe(
      true,
    );
    expect(
      Option.isNone(matchControlReply(makeControlRequest('GET_BUILD_ID'))),
    ).toBe(true);
  });
});
