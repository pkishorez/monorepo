import type { UIMessage } from '@tanstack/ai';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  AiMessagePartSchema,
  COMMON_PARTS,
  type AiMessagePart,
} from './parts.js';

type TanStackPart = UIMessage['parts'][number];
type WithoutCustom = Exclude<AiMessagePart, { type: 'custom' }>;

// Compile-time promise: every non-custom part we persist is a TanStack part,
// so TanStack's UI packages can render a stored Message unchanged.
type Assert<T extends true> = T;
type _StoredPartsAreTanStackParts = Assert<
  WithoutCustom extends
    | TanStackPart
    | (Omit<Extract<TanStackPart, { type: 'tool-result' }>, 'content'> & {
        readonly content: unknown;
      })
    ? true
    : false
>;

describe('AiMessagePartSchema', () => {
  it('decodes TanStack parts and ai-toolkit custom parts', () => {
    const decode = Schema.decodeUnknownSync(AiMessagePartSchema);
    expect(decode({ type: 'text', content: 'hi' })).toEqual({
      type: 'text',
      content: 'hi',
    });
    expect(
      decode({
        type: 'custom',
        name: COMMON_PARTS.FILE_CHANGED,
        data: { path: 'a.ts', operation: 'created' },
      }),
    ).toMatchObject({ type: 'custom', name: COMMON_PARTS.FILE_CHANGED });
    expect(() => decode({ type: 'custom', name: 'nope', data: {} })).toThrow();
  });
});
