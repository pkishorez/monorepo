import { Effect, Layer, Random, Schema } from 'effect';
import { Actor } from 'effect-oak';
import { Fields, makeField, rules } from './field/index.js';

/*
 * A waitlist form: three field Actors and the submission.
 *
 * Each field validates itself and reports its value and validity through
 * the Fields Request, so the form keeps only what it needs to submit. The
 * submission is data in the Model, not a State: the fields are Children, and
 * Children belong to a State, so leaving it would throw away what was typed.
 */

const FAKE_API_DELAY_MS = 500;
const ON_WAITLIST = ['test@example.com', 'demo@email.com', 'admin@test.com'];

const name = makeField({
  key: 'name',
  label: 'Name',
  rules: [rules.minLength(2, 'Name must be at least 2 characters')],
});

const email = makeField({
  key: 'email',
  label: 'Email',
  type: 'email',
  rules: [
    rules.required('Email is required'),
    rules.email('Please enter a valid email address'),
  ],
  check: (value) =>
    Effect.sleep(FAKE_API_DELAY_MS).pipe(
      Effect.as(
        ON_WAITLIST.includes(value.toLowerCase())
          ? 'This email is already on our waitlist'
          : null,
      ),
    ),
});

const message = makeField({
  key: 'message',
  label: "Anything you'd like to share with us?",
  multiline: true,
  rules: [],
});

export const FieldViews = {
  name: name.FieldView,
  email: email.FieldView,
  message: message.FieldView,
};

const Entry = Schema.Struct({ value: Schema.String, valid: Schema.Boolean });
const EMPTY = { value: '', valid: false };

const submitForm = (name: string) =>
  Effect.gen(function* () {
    yield* Effect.sleep(FAKE_API_DELAY_MS);
    return (yield* Random.nextBoolean)
      ? { _tag: 'SucceededSubmitForm' as const, name }
      : { _tag: 'FailedSubmitForm' as const };
  });

export const Waitlist = Actor.make('Waitlist', {
  model: Schema.Struct({
    name: Entry,
    email: Entry,
    message: Entry,
    submission: Schema.TaggedUnion({
      NotSubmitted: {},
      Submitting: {},
      SubmitSuccess: { confirmationText: Schema.String },
      SubmitError: { error: Schema.String },
    }),
  }),
  message: Schema.TaggedUnion({
    ReportedField: {
      key: Schema.Literals(['name', 'email', 'message']),
      value: Schema.String,
      valid: Schema.Boolean,
    },
    ClickedFormSubmit: {},
    SucceededSubmitForm: { name: Schema.String },
    FailedSubmitForm: {},
  }),
  provides: [Fields],
  children: { name: name.Field, email: email.Field, message: message.Field },
}).build({
  init: () => ({
    model: {
      name: EMPTY,
      email: EMPTY,
      message: EMPTY,
      submission: { _tag: 'NotSubmitted' },
    },
  }),
  provides: (self) =>
    Layer.succeed(Fields, {
      report: (key, { value, valid }) =>
        key === 'name' || key === 'email' || key === 'message'
          ? self.send({ _tag: 'ReportedField', key, value, valid })
          : Effect.void,
    }),
  update: {
    ReportedField: ({ key, value, valid }, { model }) => ({
      model: { ...model, [key]: { value, valid } },
    }),
    ClickedFormSubmit: (_, { model }) =>
      !canSubmit(model)
        ? {}
        : {
            model: { ...model, submission: { _tag: 'Submitting' } },
            command: submitForm(model.name.value),
          },
    SucceededSubmitForm: ({ name }, { model }) => ({
      model: {
        ...model,
        submission: {
          _tag: 'SubmitSuccess',
          confirmationText: `Welcome to the waitlist, ${name}! We'll be in touch soon.`,
        },
      },
    }),
    FailedSubmitForm: (_, { model }) => ({
      model: {
        ...model,
        submission: {
          _tag: 'SubmitError',
          error:
            'Sorry, there was an error adding you to the waitlist. Please try again.',
        },
      },
    }),
  },
});

/** Name and email are valid, and nothing is being submitted. */
export const canSubmit = (model: {
  readonly name: { readonly valid: boolean };
  readonly email: { readonly valid: boolean };
  readonly submission: { readonly _tag: string };
}) =>
  model.name.valid &&
  model.email.valid &&
  model.submission._tag !== 'Submitting';
