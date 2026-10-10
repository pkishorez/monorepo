import { Schema } from 'effect';
import {
  blank,
  errorOf,
  passes,
  revealed,
  rules,
  TextField,
} from '../fields/index.js';

/*
 * One position, as data in the Work History Model: Foldkit's entry
 * Submodel without its own Messages. Entries cannot be Child Actors, because
 * an Actor's Children are a fixed record (blocker 1), so the step handles
 * every entry's Messages itself, by id.
 */

export const RULES = {
  company: [rules.required('Company is required')],
  title: [rules.required('Job title is required')],
};

export const Entry = Schema.Struct({
  id: Schema.Number,
  company: TextField,
  title: TextField,
  start: Schema.String,
  end: Schema.String,
  current: Schema.Boolean,
  description: Schema.String,
});
export type Entry = typeof Entry.Type;

export const blankEntry = (id: number): Entry => ({
  id,
  company: blank,
  title: blank,
  start: '',
  end: '',
  current: false,
  description: '',
});

export const hasErrors = (entry: Entry) =>
  errorOf(RULES.company, entry.company) !== null ||
  errorOf(RULES.title, entry.title) !== null;

export const isComplete = (entry: Entry) =>
  passes(RULES.company, entry.company) && passes(RULES.title, entry.title);

export const reveal = (entry: Entry): Entry => ({
  ...entry,
  company: revealed(entry.company),
  title: revealed(entry.title),
});

/** The plain values the application keeps. */
export const summary = (entry: Entry) => ({
  id: entry.id,
  company: entry.company.value,
  title: entry.title.value,
  start: entry.start,
  end: entry.end,
  current: entry.current,
  description: entry.description,
});
