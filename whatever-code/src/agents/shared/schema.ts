import { Schema } from "effect";
export { InteractionMode } from "../../entity/session/session.js";

export const ImageBlock = Schema.Struct({
  type: Schema.Literal("image"),
  source: Schema.Struct({
    type: Schema.Literal("base64"),
    media_type: Schema.String,
    data: Schema.String,
  }),
});

export const TextBlock = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String,
});

export const ContentBlock = Schema.Union(TextBlock, ImageBlock);

export const PromptContent = Schema.Union(
  Schema.String,
  Schema.Array(ContentBlock),
);
