import { Schema } from 'effect';
import { Branches } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import * as Picker from '../../../../../../ui/controls/picker/index.ts';
import * as Catalog from '../../store.ts';
import { BranchPicker } from './branch/index.ts';
import { ModelPicker } from './model/index.ts';
import { NOBODY } from './choose.ts';
import { Listing, SkillPicker } from './skills.ts';

/*
 * The Draft's Pickers: one open at a time, each a fresh one, as the Draft
 * says, which keeps which is open and gives each its owner, so what is
 * picked goes to it. They sit here, between the Draft and its Pickers, so
 * the Draft has two kinds of Children, its modes and this.
 *
 * 1. Skills  the skills Picker: a Skill to put in at the cursor.
 * 2. Model   the model Picker: the agent, its model and settings, once
 *            they are known.
 * 3. Branch  a new session's Branch Picker, for a Project that is a git
 *            repository.
 */

/** The Picker open, and how it was opened. */
export const Picking = Schema.TaggedUnion({
  /** `typed`: opened by a `/` typed in the Composer, which the skill takes the place of. */
  Skills: { how: Picker.How, typed: Schema.Boolean },
  Model: { how: Picker.How, at: ModelPicker.At },
  Branch: { how: Picker.How },
});

const Choose = Actor.define('Choose', {
  props: Schema.Struct({
    /** The Picker open, if one is. */
    picking: Schema.NullOr(Picking),
    /** How many Pickers were opened, so each is a fresh one. */
    opened: Schema.Finite,
    /** The agent's Skills, as the skills Picker lists them. */
    skills: Listing,
    catalog: Catalog.Catalog,
    /** The agent, model and settings in effect; null until they are known. */
    current: Schema.NullOr(ModelPicker.Current),
    /** Whether the session has started, so its agent is kept. */
    started: Schema.Boolean,
    /** A new session's Project's branches; null while they are read. */
    branches: Schema.NullOr(Branches.schema),
    /** The branch picked; null: the one the Project's folder is on. */
    picked: Schema.NullOr(Schema.String),
  }),
});

export const ChooseLive = Choose.build({
  children: {
    // 1. Skills
    skills: Actor.child(SkillPicker.Live, {
      while: ({ props }) => props.picking?._tag === 'Skills',
      key: ({ props }) => String(props.opened),
      input: ({ props }) => SkillPicker.opening(props.picking?.how ?? 'keys'),
      props: ({ props }) => props.skills,
    }),
    // 2. Model
    models: Actor.child(ModelPicker.Live, {
      while: ({ props }) =>
        props.picking?._tag === 'Model' && props.current !== null,
      key: ({ props }) => String(props.opened),
      input: ({ props }) =>
        ModelPicker.opening({
          how: props.picking?.how ?? 'keys',
          at: props.picking?._tag === 'Model' ? props.picking.at : 'model',
          started: props.started,
          catalog: props.catalog,
          current: props.current ?? NOBODY,
        }),
      props: ({ props }) => ({
        catalog: props.catalog,
        current: props.current ?? NOBODY,
        alone:
          props.picking?._tag === 'Model' &&
          (props.picking.at === 'agent' || props.picking.at === 'modelAlone'),
      }),
    }),
    // 3. Branch
    branches: Actor.child(BranchPicker.Live, {
      while: ({ props }) =>
        props.picking?._tag === 'Branch' && props.branches?._tag === 'Git',
      key: ({ props }) => String(props.opened),
      input: ({ props }) => BranchPicker.opening(props.picking?.how ?? 'keys'),
      props: ({ props }) => ({
        branches: props.branches ?? { _tag: 'NotGit' as const },
        picked: props.picked,
      }),
    }),
  },
});
