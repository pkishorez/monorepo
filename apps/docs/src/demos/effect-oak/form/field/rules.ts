/** A Rule says what is wrong with a value, or null if nothing is. */
export type Rule = (value: string) => string | null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const rules = {
  required:
    (error: string): Rule =>
    (value) =>
      value.trim() === '' ? error : null,
  minLength:
    (length: number, error: string): Rule =>
    (value) =>
      value.length < length ? error : null,
  email:
    (error: string): Rule =>
    (value) =>
      EMAIL.test(value) ? null : error,
};

export const firstError = (all: ReadonlyArray<Rule>, value: string) => {
  for (const rule of all) {
    const error = rule(value);
    if (error !== null) return error;
  }
  return null;
};
