import { Schema } from 'effect';

export const StorySourceSchema = Schema.Struct({
  path: Schema.String,
  content: Schema.String,
}).annotate({
  title: 'Story Source',
  description:
    "The full text of the file a Story was authored in, resolved from the Story's declared sourceUrl.",
});

export const QuestionLeafSchema = Schema.Struct({
  slug: Schema.String,
  question: Schema.String,
  answer: Schema.String,
  snippet: Schema.String,
}).annotate({
  title: 'Question Leaf',
  description:
    'One Question of a Story: the question, its one-sentence answer, and the literal source of the proof effect extracted from the Story file.',
});

export const StoryLeafSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  setup: Schema.NullOr(Schema.String),
  questions: Schema.Array(QuestionLeafSchema),
  source: StorySourceSchema,
}).annotate({
  title: 'Story Leaf',
  description:
    'One Story in the Story tree: its derived id, the shared setup snippet, and its Questions in authored order. Never carries results.',
});

export interface StoryTreeGroup {
  readonly title: string;
  readonly groups: readonly StoryTreeGroup[];
  readonly stories: readonly (typeof StoryLeafSchema.Type)[];
}

export const StoryTreeGroupSchema: Schema.Codec<StoryTreeGroup> = Schema.Struct(
  {
    title: Schema.String,
    groups: Schema.Array(Schema.suspend(() => StoryTreeGroupSchema)),
    stories: Schema.Array(StoryLeafSchema),
  },
).annotate({
  title: 'Story Group',
  description:
    'One node of the Story tree: a title over any mix of subgroups and Story leaves.',
}) as unknown as Schema.Codec<StoryTreeGroup>;

export const StoryTreeSchema = StoryTreeGroupSchema.annotate({
  title: 'Story Tree',
  description:
    "A Project's whole Story hierarchy, rooted at the barrel's default export. Metadata only; no Story executes to produce it.",
});

export type QuestionLeaf = typeof QuestionLeafSchema.Type;
export type StoryLeaf = typeof StoryLeafSchema.Type;
export type StorySource = typeof StorySourceSchema.Type;
export type StoryTree = StoryTreeGroup;
