import { Schema } from 'effect';
export {
  InteractionMode,
  AccessMode,
} from '../../core/entity/session/session.js';

export const ToolResponse = Schema.Union(
  Schema.mutable(
    Schema.Struct({
      behavior: Schema.Literal('allow'),
      updatedInput: Schema.optionalWith(
        Schema.mutable(
          Schema.Record({ key: Schema.String, value: Schema.Unknown }),
        ),
        { exact: true },
      ),
    }),
  ),
  Schema.mutable(
    Schema.Struct({
      behavior: Schema.Literal('deny'),
      message: Schema.String,
    }),
  ),
);
export type ToolResponse = typeof ToolResponse.Type;

export const ImageBlock = Schema.Struct({
  type: Schema.Literal('image'),
  source: Schema.Struct({
    type: Schema.Literal('base64'),
    media_type: Schema.String,
    data: Schema.String,
  }),
});

export const TextBlock = Schema.Struct({
  type: Schema.Literal('text'),
  text: Schema.String,
});

export const ContentBlock = Schema.Union(TextBlock, ImageBlock);

export const PromptContent = Schema.Union(
  Schema.String,
  Schema.Array(ContentBlock),
);
