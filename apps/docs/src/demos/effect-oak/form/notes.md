# Form

Status: works. The field status is Model data, not States, so the input keeps
its focus.

## What was ported

Foldkit's `form`: a waitlist form with a name (at least 2 characters), an
email (required, well-formed, then checked against the waitlist after 500 ms)
and a free-text message. Submitting takes 500 ms and succeeds or fails at
random.

```
Waitlist (root)            Model { name, email, message: { value, valid }, submission }
                           Provides Fields; ClickedFormSubmit → Command `submit` → SucceededSubmitForm | FailedSubmitForm
├─ name: Field(name)       Model { value, status }; Typed → Rules → Fields.report (a Request)
├─ email: Field(email)     … plus an async check, replacing any check still running
└─ message: Field(message)
field/   makeField: a Field Actor and its View from Rules and an optional check
```

Every Field is made by one factory, so the three fields are three Actors with
the same behavior. A field reports `{ value, valid }` to the form through the
`Fields` Request whenever it changes; the form keeps only that.

## Deviations

- **The latest email check wins by its Worker's key.** Foldkit lets every
  `ValidateEmail` finish and drops answers for an old value. Here the check
  is a Worker with one key per value while the status is Validating, so each
  keystroke stops the check still running and starts its own; a stale answer
  cannot arrive, and there is no value guard.
- **Field status is in the Model, not States.** A View drew each State with
  its own component, so with NotValidated, Validating, Valid and Invalid as
  States every Transition would remount the input mid-typing and lose focus.
  (Now one function draws every State, so States would keep the focus; this
  demo is unchanged.)
- **Submission is in the root's Model, not its States.** The fields are
  Children, and Children belong to a State: a Submitting State would destroy
  them and everything typed.
- `foldkit/fieldValidation` is replaced by a few Rules in `field/rules.ts`.
- The fake waitlist and submit are plain Effects in the Commands, as in
  Foldkit; no Capability.
- Every keystroke is two Messages: `Typed` in the field and `ReportedField`
  in the form.

## Blockers

- **Each State is drawn by its own keyed component** (now lifted: a View is
  one function, narrowing on `_tag`; this demo is unchanged), so DOM that
  should survive a Transition (a focused input) is remounted.
- **Children belong to one State** (also hit by [weather](../weather/notes.md)),
  so the form cannot use States for its submission.

## Testing

Foldkit's stories type into fields and check the Model and
`Command.expectExact(ValidateEmail)`, resolve it with
`CompletedValidateEmail({ field: Invalid(…) })`, check that an invalid form
asks for nothing on submit (`Command.expectNone()`), and resolve `SubmitForm`
both ways. Scenes find fields by label and check the error through the
input's accessible description.

What Effect Oak would need:

- Named Commands to check and resolve the email check and the submit
  (roll-up blocker 4), and to see that a check was replaced.
- A way to test a Field on its own with a fake `Fields` Provider, and to
  check the form's `Fields.report` sends `ReportedField`. `Runtime.start` with
  a stub Layer can do the first today.
- Drawing a View from a given Model (blocker 5).

## Also surprising

- A parent cannot read its Children, by design. The form needs the fields'
  values to submit, so each field copies them up by Request, at the cost of a
  Message per keystroke. Foldkit keeps one Model.
