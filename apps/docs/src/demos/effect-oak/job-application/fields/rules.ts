/** A Rule says what is wrong with a value, or null if nothing is. */
export type Rule = (value: string) => string | null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s()-]{7,}$/;
const URL_WITHOUT_PROTOCOL = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/;

/** Optional fields: an empty value passes every Rule but `required`. */
const unlessEmpty =
  (test: (value: string) => boolean, error: string): Rule =>
  (value) =>
    value === '' || test(value) ? null : error;

export const rules = {
  required:
    (error: string): Rule =>
    (value) =>
      value.trim() === '' ? error : null,
  minLength:
    (length: number, error: string): Rule =>
    (value) =>
      value !== '' && value.length < length ? error : null,
  email: (error: string) => unlessEmpty((value) => EMAIL.test(value), error),
  phone: (error: string) => unlessEmpty((value) => PHONE.test(value), error),
  url: (error: string) =>
    unlessEmpty((value) => URL_WITHOUT_PROTOCOL.test(value), error),
};

export const firstError = (all: ReadonlyArray<Rule>, value: string) => {
  for (const rule of all) {
    const error = rule(value);
    if (error !== null) return error;
  }
  return null;
};
