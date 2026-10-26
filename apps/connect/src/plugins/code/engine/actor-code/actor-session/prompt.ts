import { Schema } from 'effect';
import type { TurnInput } from '@kestack/ai-toolkit/harness';
import { EngineRaw } from '../../engine-raw/index.js';

/*
 * A user message as a Session keeps it: its text, its Attachments as Raw
 * records them (an image's data, or the path a file was saved at), and any
 * change of model or settings it carries. The Bootstrap Sweep makes one
 * too, `resumed`, to Resume a Turn a stop cut off.
 */

export const Prompt = Schema.Struct({
  /** The Turn it starts, or its own id when it steers one. */
  id: Schema.String,
  text: Schema.String,
  attachments: Schema.Array(EngineRaw.Attachment),
  model: Schema.optionalKey(Schema.String),
  settings: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  /** The engine's own, Resuming a cut-off Turn; never a user's. */
  resumed: Schema.optionalKey(Schema.Boolean),
});
export type Prompt = typeof Prompt.Type;

/** What the harness reads of a Prompt: images inline, saved files named in the text. */
export const toTurnInput = (prompt: Prompt): TurnInput => {
  const lines = prompt.attachments.flatMap((each) =>
    each.path === undefined
      ? []
      : [`Attached file: ${each.path} (${each.mime})`],
  );
  return {
    text: [prompt.text, ...lines].filter((line) => line !== '').join('\n'),
    images: prompt.attachments.flatMap(({ name, mime, data }) =>
      data === undefined ? [] : [{ name, mime, data }],
    ),
    ...(prompt.model === undefined ? {} : { model: prompt.model }),
    ...(prompt.settings === undefined ? {} : { settings: prompt.settings }),
  };
};
