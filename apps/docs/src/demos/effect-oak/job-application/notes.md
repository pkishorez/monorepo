# Job application

Status: works. Five steps plus Review, entry lists, an async email check,
attention markers, reveal-on-submit, a live resume preview, and a fake
submit. Time Travel replays all of it.

## What was ported

Foldkit's `job-application`, its second-largest example: a multi-step job
application (Personal Info, Work History, Education, Skills, Cover Letter,
Attachments, Review) with field validation, an async "email taken" check,
lists of entries you add and remove, a step nav that marks steps needing
attention, a review page, a live resume preview beside the form, and a
1.5 s fake submit.

### Plan

The question was what should be a Node. Foldkit keeps one Model holding
every step's Submodel, and the root reads all of them for its nav, preview,
review and submit. In Effect Oak a parent cannot read its Children's Models,
so the plan was to:

- Make each step that keeps answers a Child Node: it owns its fields,
  validation and Commands.
- Keep all five Children for the whole app. The current step is Model data,
  and the View draws only that step's Child. Steps as root States would
  destroy a step's Child, and everything typed in it, on every move
  (blocker 10).
- Have each step report its whole answers (a Part) up through a Request on
  every change. The root keeps the latest Part of each step in a Sheet and
  draws the nav, preview and review from it (blocker 13).
- Send Submit's "show every error" down through a Layer Service that each
  step's Lifetime listens to (blocker 14).
- Keep entries (positions, skills) as data in their step's Model, not as
  Nodes (blocker 1).
- Make Review, the preview and the step nav drawings, not Nodes: they keep
  nothing of their own.

### Tree

```
JobApplication (root)       Model { step, sheet, submitAttempted, submission }
                            Requires Reveals (Layer); Provides Answers
                            Reported{part} → sheet[part._tag] = part
                            ClickedSubmit → revealAll (+ submit Command if complete)
├─ personalInfo: PersonalInfo   fields as Model data; EditedEmail → Rules, then a
│                               check Command (replaceCommands); Lifetime: heardReveal
├─ workHistory: WorkHistory     entries: Entry[] (data, by id), nextId; Lifetime: heardReveal
├─ skills: Skills               entries: Skill[] (data, by id), nextId; Lifetime: heardReveal
├─ coverLetter: CoverLetter     content
└─ attachments: Attachments     resume, others (name and size only)

application/   Steps, the Part and Sheet Schemas, Answers (Request), Reveals
               (Layer mailbox), report / revealAll / heardReveal, formatting
fields/        TextField { value, shown }, Rules, TextInput / TextArea drawings
step-nav/      the step list with ✓ / ! markers (a drawing)
preview/       the live resume, from the Sheet (a drawing)
review/        the Review step and Submit, from the Sheet (a drawing)
attention.ts   which steps need attention; is everything complete
```

Every Update in a step ends in its `changed(model)` helper, which returns
the new Model plus a `report` Command with the step's whole Part. Reporting
the whole Part every time keeps the root's copy right even when a Command is
replaced before it runs (see blocker 7 below).

## Deviations

- **Education is cut.** It is a third list of entries with the same shape as
  Work History (text fields, a picker, a checkbox), so it adds nothing new.
  Adding it would be one more step folder like `work-history/` and one more
  Part.
- **No mobile step Menu or preview toggle.** Foldkit has a Tabs nav on wide
  screens, a Menu on narrow ones, and a button that overlays the preview.
  Here there is one plain-button nav (stacked on top when narrow), and the
  preview shows only when the demo is wide enough (container queries, since
  the Shell's Message Log takes part of the screen).
- **Native inputs replace Foldkit's UI Submodels**: `<input type="date">`
  for DatePicker (`min`/`max` keep the start before the end, as
  `reflectMinDate` does), a native select for the pronouns Listbox, the
  kit's RadioGroup for proficiency, and a file input plus `onDrop` for
  FileDrop. None of them needs Model state of its own, so the focus and
  open/closed Messages Foldkit logs are gone. The drop zone has no "dragging
  over" highlight.
- **Files are kept as name and size, not `File`.** A Model is Schema data
  that Replay plays back; a browser File is not. A real app would upload in
  a Command and keep the server's answer.
- **Entry ids come from a counter in the Model**, not `crypto.randomUUID` in
  a Command. Update is pure, so a counter replays the same and saves a round
  trip. Foldkit's first entry ids come from flags.
- **Field validation is `{ value, shown }` plus Rules**, not
  `foldkit/fieldValidation`'s NotValidated/Validating/Valid/Invalid. Whether
  a field is valid is worked out from its Rules; `shown` says whether its
  errors are drawn yet (typed in, or revealed by Submit). The email adds
  `emailCheck: Unchecked | Checking | Free | Taken`.
- **The latest email check wins by `replaceCommands`**, as in the form demo,
  instead of Foldkit's `emailValidationId`. The value guard is kept.
- **Submit always succeeds**, as Foldkit's does; its unused SubmitError
  state is dropped.
- **The earliest start date is read in the View** (`new Date()`), since
  `init` cannot take Foldkit's `today` flag (blocker 3). Nothing in the Model
  depends on it.

## Blockers

All are known; none is new.

- **13, no data between parent and Child, is the shape of this app.** The
  root cannot read its steps, so every step copies its answers up. That
  costs:
  - The Part Schemas (`application/parts.ts`, about 95 lines): each step's
    answers declared a second time, as plain values.
  - Two Messages per keystroke: `Edited` in the step, then `Reported` in the
    root. Typing "test@example.com" is 32 Messages before the email check
    answers. The Message Log is mostly `Reported`.
  - A copy that is one Command behind the step. The submit check reads the
    copy, which is fine for a person clicking but would race a script.

  Foldkit's view reads `model.personalInfo` directly. A parent read of a
  Child's Model (`children.personalInfo.model` in the View, or the Child's
  last Model handed to Update) would delete `parts.ts`, every `changed`
  helper and the `Reported` Message.

- **14, no parent → Child Messages.** Submit must reveal every step's
  errors. `Reveals` is a mailbox Service in the Layer (about 40 lines): the
  root's Command posts, and three steps carry `requires: { reveals }`,
  `lifetime: () => heardReveal` and a `RevealedErrors` Message only to hear
  it. `tell: [[children.workHistory, { _tag: 'RevealedErrors' }], …]` would
  replace all of it.
- **10, Children belong to one State.** Steps cannot be the root's States;
  the current step is a Model field and the View picks the Child to draw.
  It works and reads well, but nothing in the tree says that only one step
  is on screen.
- **1, no list of Children.** Positions and skills are data in their step,
  handled by id (`edit(model, id, change)`), Foldkit-Submodel style. Each
  entry would be a natural Node.
- **3, no init input.** Minor here: `today` is read in the View, and entry
  ids come from a counter.
- **7, no way to stop one Command.** Every email keystroke replaces the
  step's Commands to drop the stale check. That also stops a `report`
  Command that has not run yet, which is harmless only because every report
  carries the whole step.

## Ergonomics at this size

The real question for this batch was how Effect Oak holds up at 60-odd
files. Short answer: the tree stays readable, wiring Children costs nothing,
and almost all the extra code goes into blockers 13 and 14.

- **Size.** About 2,000 lines in 33 files, against about 4,450 in Foldkit's
  source (tests excluded), with Education cut and no UI library. Effect
  Oak's per-Node shape is not where the lines go.
- **Wiring Children is free.** Foldkit's root has eight `Update.foldChild`
  blocks, eight `Got*Message` wrappers, and an `h.submodel` per step in the
  View: about 150 lines that only route Messages. Here a Child is one line
  in `children` and one `<StepView node={children.step} />`. A step's
  Messages go to the step; the root's Update never sees them.
- **Boilerplate per Node** is small and the same every time:
  `Node.make(name, { requires, model, message })`, then `.build({ init,
update })`, about 15 lines before any logic. The repeated parts are:
  - the `changed` helper (one per step, five in all, each building that
    step's Part);
  - `requires: { answers: Answers, reveals: Reveals }`, `lifetime: () =>
heardReveal` and `RevealedErrors: {}` in three steps.

  All of it comes from blockers 13 and 14, not from the Node shape.

- **The Node tree stays readable.** It is flat: a root and five Children,
  each about 50 to 170 lines of Node plus a View. Each step reads on its
  own, with its Requires saying exactly what it talks to. The two Services
  in `application/` are the only cross-cutting piece, and they hold the
  whole parent ↔ Child protocol in one file.
- **Types held up.** Each Child's Requires is checked against what the root
  Provides and Requires, and `toReact` would not compile without `Reveals`
  in the Layer. Writing `{ ...model.sheet, [part._tag]: part }` compiles
  but is loosely checked: TypeScript widens the computed key.
- **Message design matters more at this size.** One `Edited { field, value }`
  per step, typed with `Schema.Literals` of field names, keeps the Message
  unions short. Foldkit has one Message per field.
- **What hurt:** keeping the Part Schemas in step with each step's Model by
  hand. A change to a step means changing its Model, its `changed` helper,
  its Part, and the preview or review that draw it.

## Testing

Foldkit tests this example heavily. There are 47 `story` tests (19 on the
root, 28 on the steps and entries) and 22 `scene` tests (13 on the root
View, 9 on the step Views).

- **Root stories**: Next and Previous, including staying put at either end;
  picking a step from Tabs or the Menu, with `Command.resolve(Tabs.FocusTab,
…)` and `Command.resolve(Menu.FocusButton, …)`; preview toggling; each
  `Got*Message` writing through to its step; Submit on an incomplete
  application revealing errors with `Command.expectNone()`; Submit on a
  complete one asking for `SubmitApplication`.
- **Step stories**: a valid and an invalid first name; a well-formed email
  starting `ValidateEmailAsync` (`Command.expectHas`); a malformed one
  starting nothing; a stale async result being discarded. For lists:
  `ClickedAddEntry` asking for `GenerateEntryId`, resolved with
  `SucceededGenerateEntryId` or `FailedGenerateEntryId`, and an entry's
  `OutMessage.Removed` removing it.
- **Scenes** (root): the heading and first step, the nav listing every step,
  clicking Next and Previous, no Previous on the first step, Review showing
  Submit and hiding Next, and the blocking notice naming the incomplete
  steps.

What Effect Oak would need to test it the same way:

- **Named Commands** (blocker 4), to check that `EditedEmail` asked for a
  check and Submit for the submit, and to resolve them with a chosen
  Message.
- **One Update on a given Model** (blocker 5). Most of Foldkit's stories
  would port directly to the step Nodes, since their Updates are pure.
- **A Request seen as a Command** (blocker 4): "typing reports the Part" is
  a `report` Command today, an anonymous Effect.
- **Emitting a Lifetime's Message** (blocker 6), to send `RevealedErrors`.
  `Runtime.start` with a stub Layer can drive `Reveals` today.
- **Drawing a View from a given Model** (blocker 5) for the scenes. The root
  View's scenes would also need its Children's Models, since each step is
  drawn by its own View.

## Also surprising

- None of the shared modules fit. `async-data/`, `blog-server/`,
  `frame-canvas/` and `location/` are about fetching, drawing and URLs; this
  app has none of those.
- Time Travel shows the right step and the right answers at every Time,
  because the step choice and every report are Messages.
- Hidden steps keep running: a pending email check finishes while you are
  on another step, and its answer still lands in the Sheet.
