import * as Option from 'effect/Option';
import { describe, expect, it } from 'vitest';
import {
  commandReply,
  isCommandEnvelope,
  makeCommand,
  matchCommand,
  matchCommandReply,
} from '../index.js';

describe('commands', () => {
  it('keeps the frozen wire shape', () => {
    expect(makeCommand('SKIP_WAITING')).toEqual({
      __pwaToolkit: 1,
      type: 'SKIP_WAITING',
    });
    expect(commandReply.failed('x')).toEqual({
      __pwaToolkit: 1,
      type: 'FAILED',
      message: 'x',
    });
  });

  it('matches its own command', () => {
    expect(
      Option.getOrThrow(matchCommand(makeCommand('SKIP_WAITING'))).type,
    ).toBe('SKIP_WAITING');
  });

  it('ignores other traffic, unknown types and other versions', () => {
    expect(Option.isNone(matchCommand({ type: 'SKIP_WAITING' }))).toBe(true);
    expect(
      Option.isNone(matchCommand({ __pwaToolkit: 1, type: 'GET_BUILD_ID' })),
    ).toBe(true);
    expect(
      Option.isNone(matchCommand({ __pwaToolkit: 2, type: 'SKIP_WAITING' })),
    ).toBe(true);
    expect(Option.isNone(matchCommand('SKIP_WAITING'))).toBe(true);
    expect(Option.isNone(matchCommand(null))).toBe(true);
    expect(isCommandEnvelope({ __pwaToolkitRpc: 1 })).toBe(false);
  });

  it('matches replies but not commands as replies', () => {
    expect(Option.isSome(matchCommandReply(commandReply.done()))).toBe(true);
    expect(Option.isSome(matchCommandReply(commandReply.failed('x')))).toBe(
      true,
    );
    expect(Option.isNone(matchCommandReply(makeCommand('SKIP_WAITING')))).toBe(
      true,
    );
  });
});
