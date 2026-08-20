import { Schema } from 'effect';

export class InvalidName extends Schema.TaggedError<InvalidName>()(
  'InvalidName',
  {},
) {}

const MAX_NAME_LENGTH = 40;

export const normalizeName = (input: string): string | null => {
  const name = input.trim().replace(/\s+/g, ' ');
  return name.length === 0 || name.length > MAX_NAME_LENGTH ? null : name;
};
