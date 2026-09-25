import type { Segment } from '../../../../engine/transcript/index.ts';
import type { ContextPayload } from '../context-buttons/index.ts';

/** Plain text: spoken words as heard, each injection's text in brackets. */
export const transcriptToText = (
  segments: ReadonlyArray<Segment<ContextPayload>>,
): string =>
  segments
    .map((segment) =>
      segment.kind === 'transcription'
        ? segment.text
        : `[${segment.payload.text}]`,
    )
    .join(' ')
    .replace(/\s+([,.;:!?])/g, '$1');
