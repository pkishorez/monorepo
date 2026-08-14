import { Schema } from 'effect';

export const StorySourceSchema = Schema.Struct({
  path: Schema.String,
  content: Schema.String,
}).annotate({
  title: 'Story Source',
  description:
    "The full text of the file a Story was authored in, resolved from the Story's declared sourceUrl.",
});

export const StoryLeafSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.String,
  markdown: Schema.String,
  source: Schema.optional(StorySourceSchema),
}).annotate({
  title: 'Story Leaf',
  description:
    'One Story in the Story tree: its derived id plus the inline and detailed documentation. Never carries results.',
});

export const StoryDocLeafSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.String,
  markdown: Schema.String,
}).annotate({
  title: 'Story Doc Leaf',
  description:
    'One documentation-only page in the Story tree: prose with no runnable Story behind it.',
});

export interface StoryTreeGroup {
  readonly title: string;
  readonly description: string;
  readonly markdown: string;
  readonly docs: readonly (typeof StoryDocLeafSchema.Type)[];
  readonly groups: readonly StoryTreeGroup[];
  readonly stories: readonly (typeof StoryLeafSchema.Type)[];
}

export const StoryTreeGroupSchema: Schema.Codec<StoryTreeGroup> = Schema.Struct(
  {
    title: Schema.String,
    description: Schema.String,
    markdown: Schema.String,
    docs: Schema.Array(StoryDocLeafSchema),
    groups: Schema.Array(Schema.suspend(() => StoryTreeGroupSchema)),
    stories: Schema.Array(StoryLeafSchema),
  },
).annotate({
  title: 'Story Group',
  description:
    'One node of the Story tree: documentation plus any mix of doc pages, subgroups, and Story leaves.',
}) as unknown as Schema.Codec<StoryTreeGroup>;

export const StoryTreeSchema = StoryTreeGroupSchema.annotate({
  title: 'Story Tree',
  description:
    "A Project's whole documentation-plus-Stories hierarchy, rooted at the barrel's default export. Metadata only; no Story executes to produce it.",
});

export type StoryLeaf = typeof StoryLeafSchema.Type;
export type StoryDocLeaf = typeof StoryDocLeafSchema.Type;
export type StorySource = typeof StorySourceSchema.Type;
export type StoryTree = StoryTreeGroup;
