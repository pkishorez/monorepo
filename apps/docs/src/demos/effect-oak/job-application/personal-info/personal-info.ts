import { Effect, Schema } from 'effect';
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
 * The first step: name, email, phone, pronouns, portfolio and start date.
 *
 * The email is checked twice: its Rules at once, and then, if they pass,
 * against a fake list of taken emails after 600 ms. Each keystroke starts
 * its check under the same Command key, which replaces the check still
 * running, so only the latest value's answer comes back.
 *
 * Every Update ends in `changed`, which reports the whole step to the
 * application. That one helper is what keeps the copy up there current.
 */

const FAKE_API_DELAY_MS = 600;
const TAKEN_EMAILS = [
  'admin@foldkit.dev',
  'test@example.com',
  'demo@foldkit.dev',
];

export const PRONOUNS = [
  'He/Him',
  'She/Her',
  'They/Them',
  'He/They',
  'She/They',
  'Other',
] as const;

export const RULES = {
  firstName: [
    rules.required('First name is required'),
    rules.minLength(2, 'First name must be at least 2 characters'),
  ],
  lastName: [rules.required('Last name is required')],
  email: [
    rules.required('Email is required'),
    rules.email('Please enter a valid email address'),
  ],
  phone: [rules.phone('Please enter a valid phone number')],
  portfolioUrl: [rules.url('Please enter a valid URL')],
};

const TEXT_FIELDS = ['firstName', 'lastName', 'phone', 'portfolioUrl'] as const;

const Model = Schema.Struct({
  firstName: TextField,
  lastName: TextField,
  email: TextField,
  /** The taken-email check: only `Free` makes the email complete. */
  emailCheck: Schema.Literals(['Unchecked', 'Checking', 'Free', 'Taken']),
  phone: TextField,
  pronoun: Schema.String,
  customPronouns: Schema.String,
  portfolioUrl: TextField,
  availableDate: Schema.String,
});
type Model = typeof Model.Type;

/** The email's error: its Rules first, then the check. */
export const emailError = (model: Model) =>
  errorOf(RULES.email, model.email) ??
  (model.email.shown && model.emailCheck === 'Taken'
    ? 'This email is already in use'
    : null);

const hasErrors = (model: Model) =>
  emailError(model) !== null ||
  TEXT_FIELDS.some((key) => errorOf(RULES[key], model[key]) !== null);

const complete = (model: Model) =>
  model.emailCheck === 'Free' &&
  TEXT_FIELDS.every((key) => passes(RULES[key], model[key]));

const changed = (model: Model) => ({
  model,
  command: report({
    _tag: 'PersonalInfo',
    hasErrors: hasErrors(model),
    complete: complete(model),
    name: `${model.firstName.value} ${model.lastName.value}`.trim(),
    email: model.email.value,
    phone: model.phone.value,
    pronouns: model.pronoun === 'Other' ? model.customPronouns : model.pronoun,
    portfolioUrl: model.portfolioUrl.value,
    availableDate: model.availableDate,
  }),
});

const checkEmail = (value: string) =>
  Effect.sleep(FAKE_API_DELAY_MS).pipe(
    Effect.as({
      _tag: 'CheckedEmail' as const,
      value,
      taken: TAKEN_EMAILS.includes(value.toLowerCase()),
    }),
  );

export const PersonalInfo = Actor.make('PersonalInfo', {
  requires: { answers: Answers, reveals: Reveals },
  model: Model,
  message: Schema.TaggedUnion({
    Edited: { field: Schema.Literals(TEXT_FIELDS), value: Schema.String },
    EditedEmail: { value: Schema.String },
    CheckedEmail: { value: Schema.String, taken: Schema.Boolean },
    ChosePronoun: { pronoun: Schema.String },
    EditedCustomPronouns: { value: Schema.String },
    ChoseAvailableDate: { date: Schema.String },
    RevealedErrors: {},
  }),
}).build({
  init: () => ({
    model: {
      firstName: blank,
      lastName: blank,
      email: blank,
      emailCheck: 'Unchecked',
      phone: blank,
      pronoun: '',
      customPronouns: '',
      portfolioUrl: blank,
      availableDate: '',
    },
  }),
  lifetime: heardReveal,
  update: {
    Edited: ({ field, value }, { model }) =>
      changed({ ...model, [field]: typed(value) }),
    EditedEmail: ({ value }, { model }) => {
      const email = typed(value);
      const rulesPass = passes(RULES.email, email);
      const next = changed({
        ...model,
        email,
        emailCheck: rulesPass ? 'Checking' : 'Unchecked',
      });
      return {
        ...next,
        command: {
          key: 'checkEmail',
          run: rulesPass
            ? (self) =>
                Effect.all(
                  [
                    next.command,
                    checkEmail(value).pipe(Effect.flatMap(self.send)),
                  ],
                  { concurrency: 'unbounded', discard: true },
                )
            : next.command,
        },
      };
    },
    CheckedEmail: ({ value, taken }, { model }) =>
      value !== model.email.value || model.emailCheck !== 'Checking'
        ? {}
        : changed({ ...model, emailCheck: taken ? 'Taken' : 'Free' }),
    ChosePronoun: ({ pronoun }, { model }) => changed({ ...model, pronoun }),
    EditedCustomPronouns: ({ value }, { model }) =>
      changed({ ...model, customPronouns: value }),
    ChoseAvailableDate: ({ date }, { model }) =>
      changed({ ...model, availableDate: date }),
    RevealedErrors: (_, { model }) =>
      changed({
        ...model,
        firstName: revealed(model.firstName),
        lastName: revealed(model.lastName),
        email: revealed(model.email),
        phone: revealed(model.phone),
        portfolioUrl: revealed(model.portfolioUrl),
      }),
  },
});
