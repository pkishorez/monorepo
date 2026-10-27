import { Schema } from 'effect';
import type { Effect } from 'effect';
import { SkillSchema } from '@kestack/connect/code';
import * as Picker from '../../../../../../../../ui/controls/picker/index.ts';

/*
 * The skills Picker: one Step of the agent's skills. The one picked goes
 * into the Draft as a `/name`, one atom.
 */

export const Listing = Schema.Struct({
  skills: Schema.Array(SkillSchema),
  /** The skills are still being read. */
  loading: Schema.Boolean,
  /** Why the skills could not be read. */
  problem: Schema.NullOr(Schema.String),
});
type Listing = typeof Listing.Type;

const Skills = Picker.make('SkillPicker', {
  props: Listing,
  steps: {
    skill: {
      placeholder: () => 'Search skills',
      empty: () => 'No skill by that name',
      rows: ({ props }) => ({
        rows: props.skills.map(rowOf('Skills')),
        loading: props.loading,
        problem:
          props.problem === null
            ? null
            : `Couldn't load skills: ${props.problem}`,
      }),
    },
  },
});

const rowOf =
  (group: string) =>
  ({ name, description, argumentHint }: typeof SkillSchema.Type) => ({
    value: name,
    label: `/${name}`,
    group,
    ...(description ? { detail: description } : {}),
    ...(argumentHint ? { hint: argumentHint } : {}),
  });

/**
 * The skills Picker the page keeps while it is open: one Step of skills.
 * `done` hears the name picked, or null.
 */
export const SkillPicker = {
  Live: Skills.Live,
  View: Skills.View,
  opening: (how: typeof Picker.How.Type) => ({
    how,
    step: { id: 'skill', key: '' },
    choices: [],
  }),
  owner: (done: (name: string | null) => Effect.Effect<void>) =>
    Skills.owner({ done: (choices) => done(choices?.at(-1)?.value ?? null) }),
  /** Whether it has anything to offer, or to say: rows, loading, or why not. */
  offers: (listing: Listing) =>
    listing.loading || listing.problem !== null || listing.skills.length > 0,
};
