import { Schema } from 'effect';

export const StorySourceSchema = Schema.Struct({
  path: Schema.String,
  content: Schema.String,
}).annotate({
  title: 'Story Source',
  description:
    'The full text of a project file backing a Story: the file the Story was authored in, or the support file its proofs import.',
});

export const StoryPageSchema = Schema.Struct({
  path: Schema.String,
  content: Schema.String,
}).annotate({
  title: 'Story Page',
  description:
    "The markdown page narrating a Story or a Story Group: a Story's sibling `.md` file, or a Story Group's `index.md`. Null when the author wrote none.",
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
  description: Schema.String,
  spine: Schema.Boolean,
  page: Schema.NullOr(StoryPageSchema),
  setup: Schema.NullOr(Schema.String),
  questions: Schema.Array(QuestionLeafSchema),
  source: StorySourceSchema,
  support: Schema.NullOr(StorySourceSchema),
}).annotate({
  title: 'Story Leaf',
  description:
    'One Story in the Story tree: its derived id, its one-line description, whether it sits on the spine, its markdown page, the shared setup snippet, its Questions in authored order, and the support file its proofs import. Never carries results.',
});

export interface StoryTreeGroup {
  readonly title: string;
  readonly description: string;
  readonly page: typeof StoryPageSchema.Type | null;
  readonly groups: readonly StoryTreeGroup[];
  readonly stories: readonly (typeof StoryLeafSchema.Type)[];
}

export const StoryTreeGroupSchema: Schema.Codec<StoryTreeGroup> = Schema.Struct(
  {
    title: Schema.String,
    description: Schema.String,
    page: Schema.NullOr(StoryPageSchema),
    groups: Schema.Array(Schema.suspend(() => StoryTreeGroupSchema)),
    stories: Schema.Array(StoryLeafSchema),
  },
).annotate({
  title: 'Story Group',
  description:
    'One node of the Story tree: a title, a one-line description, its markdown page, over any mix of subgroups and Story leaves.',
}) as unknown as Schema.Codec<StoryTreeGroup>;

export const StoryTreeSchema = StoryTreeGroupSchema.annotate({
  title: 'Story Tree',
  description:
    "A Project's whole Story hierarchy, rooted at the barrel's default export. Metadata only; no Story executes to produce it.",
});

export type QuestionLeaf = typeof QuestionLeafSchema.Type;
export type StoryLeaf = typeof StoryLeafSchema.Type;
export type StorySource = typeof StorySourceSchema.Type;
export type StoryPage = typeof StoryPageSchema.Type;
export type StoryTree = StoryTreeGroup;
