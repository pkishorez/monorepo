import { Schema } from 'effect';

export const StoryLeafSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.String,
  markdown: Schema.String,
}).annotate({
  title: 'Story Leaf',
  description:
    'One Story in the Story tree: its derived id plus the inline and detailed documentation. Never carries results.',
});

export interface StoryTreeGroup {
  readonly title: string;
  readonly description: string;
  readonly markdown: string;
  readonly groups: readonly StoryTreeGroup[];
  readonly stories: readonly (typeof StoryLeafSchema.Type)[];
}

export const StoryTreeGroupSchema: Schema.Codec<StoryTreeGroup> = Schema.Struct(
  {
    title: Schema.String,
    description: Schema.String,
    markdown: Schema.String,
    groups: Schema.Array(Schema.suspend(() => StoryTreeGroupSchema)),
    stories: Schema.Array(StoryLeafSchema),
  },
).annotate({
  title: 'Story Group',
  description:
    'One node of the Story tree: documentation plus either subgroups or Story leaves (the other list is empty).',
}) as unknown as Schema.Codec<StoryTreeGroup>;

export const StoryTreeSchema = StoryTreeGroupSchema.annotate({
  title: 'Story Tree',
  description:
    "A Project's whole documentation-plus-Stories hierarchy, rooted at the barrel's default export. Metadata only; no Story executes to produce it.",
});

export type StoryLeaf = typeof StoryLeafSchema.Type;
export type StoryTree = StoryTreeGroup;
