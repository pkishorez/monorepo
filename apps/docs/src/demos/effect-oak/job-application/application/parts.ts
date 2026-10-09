import { Schema } from 'effect';

/*
 * What each step reports to the application: its answers as plain values,
 * and whether it has errors showing and is complete. The application keeps
 * the latest Part of every step in its Sheet, because it cannot read its
 * Children's Models (blocker 13), and draws the preview and the review from
 * it.
 */

const health = { hasErrors: Schema.Boolean, complete: Schema.Boolean };

const WorkEntry = Schema.Struct({
  id: Schema.Number,
  company: Schema.String,
  title: Schema.String,
  start: Schema.String,
  end: Schema.String,
  current: Schema.Boolean,
  description: Schema.String,
});

const SkillEntry = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  proficiency: Schema.String,
});

const FileInfo = Schema.Struct({ name: Schema.String, size: Schema.Number });

export const Part = Schema.TaggedUnion({
  PersonalInfo: {
    ...health,
    name: Schema.String,
    email: Schema.String,
    phone: Schema.String,
    pronouns: Schema.String,
    portfolioUrl: Schema.String,
    availableDate: Schema.String,
  },
  WorkHistory: { ...health, entries: Schema.Array(WorkEntry) },
  Skills: { ...health, entries: Schema.Array(SkillEntry) },
  CoverLetter: { ...health, content: Schema.String },
  Attachments: {
    ...health,
    resume: Schema.NullOr(FileInfo),
    others: Schema.Array(FileInfo),
  },
});
export type Part = typeof Part.Type;

/** The latest Part of every step. */
export const Sheet = Schema.Struct(Part.cases);
export type Sheet = typeof Sheet.Type;

export { FileInfo };

const fine = { hasErrors: false, complete: true };
const unfinished = { hasErrors: false, complete: false };

/** The Sheet before anyone types: what every step reports for its init. */
export const blankSheet: Sheet = {
  PersonalInfo: {
    _tag: 'PersonalInfo',
    ...unfinished,
    name: '',
    email: '',
    phone: '',
    pronouns: '',
    portfolioUrl: '',
    availableDate: '',
  },
  WorkHistory: {
    _tag: 'WorkHistory',
    ...unfinished,
    entries: [
      {
        id: 0,
        company: '',
        title: '',
        start: '',
        end: '',
        current: false,
        description: '',
      },
    ],
  },
  Skills: {
    _tag: 'Skills',
    ...unfinished,
    entries: [{ id: 0, name: '', proficiency: 'Intermediate' }],
  },
  CoverLetter: { _tag: 'CoverLetter', ...fine, content: '' },
  Attachments: { _tag: 'Attachments', ...fine, resume: null, others: [] },
};
