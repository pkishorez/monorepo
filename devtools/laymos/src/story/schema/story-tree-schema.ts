import { Schema } from 'effect';

export const ProofSourceSchema = Schema.Struct({
  path: Schema.String,
  content: Schema.String,
}).annotate({
  title: 'Proof Source',
  description: 'The full text of the one file a Proof lives in.',
});

export const VenueSchema = Schema.Literals(['process', 'browser']);

export const ProofLeafSchema = Schema.Struct({
  /** Its Story's id plus the file name without `.proof.ts(x)`. */
  id: Schema.String,
  /** The file name without `.proof.ts(x)`. */
  name: Schema.String,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  venue: VenueSchema,
  critical: Schema.Boolean,
  source: ProofSourceSchema,
}).annotate({
  title: 'Proof Leaf',
  description: 'One Proof in the Story tree. Never carries results.',
});

export const TellingIssueSchema = Schema.Struct({
  kind: Schema.Literals([
    /** The folder has no `story.md`. */
    'missing-telling',
    /** The Telling has no `#` title or no pitch paragraph. */
    'incomplete-telling',
    /** A link names a Story or Proof id that does not exist. */
    'broken-link',
    /** A sub-Story the Telling never links. */
    'unnamed-part',
  ]),
  /** The id the issue is about: the broken link's target or the unnamed sub-Story. */
  target: Schema.NullOr(Schema.String),
  message: Schema.String,
}).annotate({
  title: 'Telling Issue',
  description: 'Something wrong with how a Story tells itself.',
});

export interface StoryNode {
  /** The names from the top Story down: `std-toolkit/evolving-schema`. The top Story's id is the Project's folder name. */
  readonly id: string;
  /** The last segment of the id. */
  readonly name: string;
  /** The folder beneath the Stories path; empty for the top Story. */
  readonly path: string;
  /** The Telling's `#` heading; the folder name when missing. */
  readonly title: string;
  /** The Telling's first paragraph; empty when missing. */
  readonly pitch: string;
  /** The Telling's markdown after the pitch, links left as written. */
  readonly body: string;
  /** Sub-Stories in the order the Telling first links them; unlinked ones last, by name. */
  readonly stories: readonly StoryNode[];
  /** Proofs in the order the Telling first links them; unlinked ones last, by name. */
  readonly proofs: readonly (typeof ProofLeafSchema.Type)[];
  readonly issues: readonly (typeof TellingIssueSchema.Type)[];
}

export const StoryNodeSchema: Schema.Codec<StoryNode> = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  path: Schema.String,
  title: Schema.String,
  pitch: Schema.String,
  body: Schema.String,
  stories: Schema.Array(Schema.suspend(() => StoryNodeSchema)),
  proofs: Schema.Array(ProofLeafSchema),
  issues: Schema.Array(TellingIssueSchema),
}).annotate({
  title: 'Story',
  description:
    'One idea told to its Reader: a Telling, the Proofs that back it, and its sub-Stories.',
}) as unknown as Schema.Codec<StoryNode>;

export const StoryTreeSchema = StoryNodeSchema.annotate({
  title: 'Story Tree',
  description:
    "A Project's Stories from its top Story down. Metadata only; no Proof executes to produce it.",
});

export type ProofLeaf = typeof ProofLeafSchema.Type;
export type ProofSource = typeof ProofSourceSchema.Type;
export type TellingIssue = typeof TellingIssueSchema.Type;
export type Venue = typeof VenueSchema.Type;
export type StoryTree = StoryNode;
