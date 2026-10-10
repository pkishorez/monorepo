import { Schema } from 'effect';
import { Actor } from 'effect-oak';
import { Answers, heardReveal, report, Reveals } from '../application/index.js';
import {
  blank,
  errorOf,
  passes,
  revealed,
  rules,
  TextField,
  typed,
} from '../fields/index.js';

/*
 * The skills, each a name and a level. The same list pattern as Work
 * History: entries are data with ids from a counter, handled by the step.
 * An entry is small enough to live in this file.
 */

export const LEVELS = [
  'Beginner',
  'Intermediate',
  'Advanced',
  'Expert',
] as const;

export const NAME_RULES = [rules.required('Skill name is required')];

const Skill = Schema.Struct({
  id: Schema.Number,
  name: TextField,
  proficiency: Schema.Literals(LEVELS),
});
type Skill = typeof Skill.Type;

const blankSkill = (id: number): Skill => ({
  id,
  name: blank,
  proficiency: 'Intermediate',
});

const Model = Schema.Struct({
  entries: Schema.Array(Skill),
  nextId: Schema.Number,
});
type Model = typeof Model.Type;

const changed = (model: Model) => ({
  model,
  command: report({
    _tag: 'Skills',
    hasErrors: model.entries.some(
      (entry) => errorOf(NAME_RULES, entry.name) !== null,
    ),
    complete:
      model.entries.length > 0 &&
      model.entries.every((entry) => passes(NAME_RULES, entry.name)),
    entries: model.entries.map((entry) => ({
      id: entry.id,
      name: entry.name.value,
      proficiency: entry.proficiency,
    })),
  }),
});

const edit = (model: Model, id: number, change: (entry: Skill) => Skill) =>
  changed({
    ...model,
    entries: model.entries.map((entry) =>
      entry.id === id ? change(entry) : entry,
    ),
  });

export const Skills = Actor.make('Skills', {
  requires: { answers: Answers, reveals: Reveals },
  model: Model,
  message: Schema.TaggedUnion({
    ClickedAdd: {},
    ClickedRemove: { id: Schema.Number },
    EditedName: { id: Schema.Number, value: Schema.String },
    ChoseLevel: { id: Schema.Number, level: Schema.Literals(LEVELS) },
    RevealedErrors: {},
  }),
}).build({
  init: () => ({ model: { entries: [blankSkill(0)], nextId: 1 } }),
  lifetime: heardReveal,
  update: {
    ClickedAdd: (_, { model }) =>
      changed({
        entries: [...model.entries, blankSkill(model.nextId)],
        nextId: model.nextId + 1,
      }),
    ClickedRemove: ({ id }, { model }) =>
      changed({
        ...model,
        entries: model.entries.filter((entry) => entry.id !== id),
      }),
    EditedName: ({ id, value }, { model }) =>
      edit(model, id, (entry) => ({ ...entry, name: typed(value) })),
    ChoseLevel: ({ id, level }, { model }) =>
      edit(model, id, (entry) => ({ ...entry, proficiency: level })),
    RevealedErrors: (_, { model }) =>
      changed({
        ...model,
        entries: model.entries.map((entry) => ({
          ...entry,
          name: revealed(entry.name),
        })),
      }),
  },
});
