import { describe, expect, it } from 'vitest';
import { Schema } from 'effect';
import { ESchema, EntityESchema, ValueESchema, eschemaOf } from '../index.js';

const Note = ESchema.make('Note', { text: Schema.String }).build();
const Task = EntityESchema.make('Task', 'taskId', {
  title: Schema.String,
}).build();
const Theme = ValueESchema.make('Theme', Schema.String).build();

describe('eschemaOf', () => {
  it('finds the ESchema behind its schema, of every kind', () => {
    expect(eschemaOf(Note.schema)).toBe(Note);
    expect(eschemaOf(Task.schema)).toBe(Task);
    expect(eschemaOf(Theme.schema)).toBe(Theme);
  });

  it('finds none behind a plain schema, or one that only nests an ESchema', () => {
    expect(eschemaOf(Schema.Struct({ text: Schema.String }))).toBeUndefined();
    expect(eschemaOf(Schema.Array(Note.schema))).toBeUndefined();
    expect(eschemaOf(Task.entity)).toBeUndefined();
  });
});
