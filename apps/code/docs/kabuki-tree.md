# code actor tree

`code` runs Claude Code and Codex Sessions in Projects, on every Machine of
the signed-in Account at once. Its root is a Page, drawn only in the
browser. The app Layer gives it the Accounts, the Cloud Connect client,
the Replica Store, Device State, the saved Machine Lists, `Machines`, the
Recorder and `Dictations`. Each Actor reads only what it shows, so a change
draws only the part that shows it.
Changed through `/kabukifi`; edit by hand and it drifts.

## Tree

```
src/
  app.tsx  pages.ts  keys.ts                    entry files
  shell/                                        the root page
    actors/   machine-list · sidebar · header · dictation · project-picker ·
              session-switcher · session-actions · microphone-picker
    pages/    home · settings (machines, shortcuts) · project (session)
    places/ · refusal/ · replica/ · connection/  plain Modules of the tree
    services/                                   reach
  layer/      capabilities/ · services/ · machine-health/   what the app Layer gives
  ui/ · sign-in/                                used by the entry files and the tree
  deploy/     infra/ · machines-api/            the server, not the browser app
```

`actors/` and `pages/` are Wrappers: they say the kind, so an Actor's
folder has no prefix.

```
shell                                   root; Provides CurrentAccount, Replicas, AiClients
│                                       States: Reading | Ready
├── (account, replicas)                 always; library Actors
├── actors/machine-list                 Ready, while signed in; key: account id
├── actors/sidebar                      Ready, always
├── actors/header                       Ready, always
├── actors/project-picker               Ready, always
├── actors/session-switcher             Ready, always
├── actors/session-actions              Ready, always
├── actors/microphone-picker            Ready, always
├── actors/dictation                    Ready, always
├── pages/home                          while the URL names it
├── pages/settings                      while the URL names it
│   ├── machines                        always
│   │   ├── harness-binaries            each: listed Machine id
│   │   └── speech-to-text              each: listed Machine id
│   └── shortcuts                       always
└── pages/project                       /m/:machineId/p/:projectId; Provides AiClient, SharedCatalog, Picker Owners
    ├── draft                           while no session is open: the new session's
    └── session                         /s/:sessionId
        └── draft                       key: the session id
```

Every Picker made by `Picker.make`, every Replica Query and the Account
Switcher are Actors from a library or a factory. They have no folder of
their own.

## How it connects

Down, from the root: what each level gives the one below.

```
app Layer ─ Accounts, Store, MachinesClient, DeviceState, SavedMachines,
            Machines, Recorder, Dictations ─────────────────────▶ shell
shell ─ Provides CurrentAccount, Replicas, AiClients ────────▶ everything below
shell ─ Input: accountId; Props: email ──────────────────────▶ machine-list
shell ─ Props: place (the Draft open) ───────────────────────▶ header, dictation
shell ─ Props: bindings ─────────────────────────────────────▶ session-actions
project ─ Provides AiClient of :machineId, SharedCatalog ──────────▶ session
machines ─ each id; Input: machineId ───────────────▶ harness-binaries, speech-to-text
```

Up, from the leaves: what each level asks of the one above, and what runs.

```
machine-list ─ publishes into Machines ─────────────▶ sidebar, Pickers, Dictation, pages
sidebar, Settings, home ─ Request Machines.reload / forget ─▶ machine-list
any Picker ─ Request Owner.done / load / settle ──────────▶ the Actor that holds it
session ─ Request SharedCatalog.retry ───────────────▶ project
shell ─ Command askDictation, into Dictations ───────▶ dictation
machine-list ─ Worker: recheck, while a Line is down ▶ Sends RecheckDue
sidebar ─ Worker: unsettle, while one is asked ─────▶ Sends Unsettled, UnsettleRefused
```

## shell

**Does**: Holds the app for the Account signed in, and every part that lives on every page.
**Input**: none
**Model**: account: who is signed in, kept across States; signInProblem: why signing in failed; back: where Settings were opened from
**States**: Reading: nothing is drawn, the Bindings are read (BindingsRead → Ready); Ready: bindings, the keys; BindingsRead again when they change
**Messages**: BindingsRead: a Worker; Signed: the accounts Worker; SignInAsked, SignInFailed: the View, signIn; NewSessionAsked: the `n` key; SettingsToggled: Ctrl+, and Escape; DictationAsked: Space, Ctrl+Space, the mic button, a Draft
**Commands**: signIn: ends with SignInFailed or nothing; keepAccounts: once Accounts are signed in, and each time one is signed out, keeps only their records; askDictation: ends with nothing; Router.push
**Workers**: accounts: always, at the top, Sends Signed; read: in Reading, Sends BindingsRead; bindings: in Ready, Sends BindingsRead when the Bindings change
**Requires**: Navigation, DeviceState, Accounts, Store, SavedMachines, Machines, Dictations
**Provides**: CurrentAccount, at the top, from the Account Switcher; Replicas and AiClients, at the top, from `services/reach.ts`
**Services**: reach: holds a Machine's Instance only while it is listed, and dials each Machine at its listed address
**Children**: account, replicas: always; machine-list: in Ready, while signed in, key the account id; the other Actors in the Tree: in Ready, always
**View**: Reading: nothing. Ready: signing in while nobody is signed in; else the App Shell, with each part handed its own Instance

### Decisions

- **The root keeps only the account, the Bindings and `back`**, because every other datum is read by one part, and the root's View draws the whole frame. Caveat: each Child follows its own source, so the same source is read by more than one Worker.
- **Bindings are a State's data, not Model**, because they exist only once read, and nothing is drawn before. Caveat: none.
- **`Replicas` and `AiClients` are root Provides, not the app Layer's**, because `Replicas.child` is a root Child and the library pairs them. Caveat: the root's own Workers cannot use them; none needs to.
- **The router is in `src/pages.ts`**, read down from the root's definition. Caveat: none.
- **Dictation asks go through the `Dictations` queue the root fills**, because the asks come from Views across the tree, and `Took` comes from the Draft's editor, which holds no Dictation handle. Caveat: it is a parent reaching a Child by a side channel.

## machine-list

**Does**: Holds one Account's Machines and a Line to each.
**Input**: accountId
**Model**: accountId; machines: the list, null before any; fetchedAt; fetching; problem; forgetting; lines: each Machine's Line; speech: each Machine's Speech to Text; rechecks: how many Rechecks since every Line was up
**States**: none
**Messages**: Saved, Fetched, Failed: its Workers; ReloadAsked: Reload, through Machines; RecheckDue: the recheck Worker; LineChanged, SpeechWatched: its Workers; ForgetAsked, ForgetDismissed: Settings, through Machines; Forgot, ForgetFailed: forget
**Commands**: save: ends with nothing; forget: ends with Forgot or ForgetFailed; keep: keeps only the records of the Machines on the first list; drop: deletes a forgotten Machine's records
**Workers**: saved: while no list; fetch: while fetching; lines, speech: each listed Machine; recheck: while not fetching and a Line is not up, waits 3 seconds for the first 20, then 30, Sends RecheckDue; publish: always, into Machines; requests: always, from Machines
**Requires**: MachinesClient, SavedMachines, Store, Link, AiClients
**Provides**: none · **Services**: none · **Children**: none
**View**: on home, how to start a Machine while there is none, or why the list cannot be read

### Decisions

- **The Machine List and the Lines are one Actor**, because a Recheck depends on the Lines, and both follow the same list. Caveat: its Model changes as a download's progress arrives; only what reads that part draws again.
- **The list is asked again only on Reload and on Recheck, not on a timer**, because a list with every Line up has nothing new to say. Caveat: a Machine's Last Seen goes stale while every Line is up; nothing reads it then.
- **The list reaches others through `Machines`, an app-Layer Capability, not as Props**, because its readers are its siblings and a new Account gives a fresh Instance. Caveat: each reader picks its own part and drops the rest.

## sidebar

**Does**: Lists the Projects and Sessions of the Machine Filter's Machines.
**Input**: none
**Model**: machines: ids and names, null before any list; problem; chosen: the Machine Filter, from Device State; unseen: the Unseen marks; unsettling: the Session being Un-settled
**States**: none
**Messages**: MachinesKnown, DeviceRead: its Workers; MachineChosen, ReloadAsked, SessionOpened, UnsettleAsked: its View; Unsettled, UnsettleRefused: the unsettle Worker
**Commands**: setSidebarMachine: ends with nothing; reload: ends with nothing; Router.push
**Workers**: known: always, Sends MachinesKnown when ids or names change; device: always, Sends DeviceRead; unsettle: while a Session is being Un-settled
**Requires**: Machines, DeviceState, AiClients, Navigation
**Provides**: none · **Services**: none
**Children**: projects, sessions: Replica Queries, each: the Machines shown
**View**: the Machine Filter and Reload, the Projects and their Sessions, the Settled List

### Decisions

- **The sidebar is an Actor, not a View of the root**, because its Projects, Sessions and marks change often and only it shows them. Caveat: the Project Picker's plus is handed in through a React context, `Slots`.
- **Only the Machines shown are read**, because a Machine not shown has nothing to draw here. Caveat: its rows sync again when it is shown.
- **Un-settling is a Worker of the sidebar, not an Actor**, because it has one State, one Worker and no View. Caveat: one Session at a time.

## header

**Does**: Reads the rows of the project and the session the URL names.
**Input**: none · **Props**: place
**Model**: none · **States**: none · **Messages**: none · **Commands**: none · **Workers**: none
**Requires**: none · **Provides**: none · **Services**: none
**Children**: project: ProjectRow, while a project is open; session: SessionRow, while a session is open
**View**: the title, and the open session's agent and model

## project-picker · session-switcher · session-actions · microphone-picker

**Does**: Each owns one Picker: `model.picking` opens it, and `opened` keys a fresh Instance each time.
**Props**: none / none / bindings / none
**Workers**: machines, always, and recent, while open / sessions, while open / session, while open / inputs and chosen, while open
**Requires**: AiClients, Navigation, Replicas, Machines / Navigation, Replicas, Machines / AiClients, Navigation, Replicas / Recorder, DeviceState
**Provides**: its Picker's Owner, from self
**Children**: picker, while open, key: opened
**View**: its Picker, and a Button or a Notice where one is drawn

### Decisions

- **A Picker is a `while` Child keyed by `opened`, not a State**, because open and closed hold the same data. Caveat: the owner's Model carries a counter.
- **The Project Picker follows the Machines always**, because its first Step is chosen as it opens. Caveat: one Worker runs while it is closed.

## dictation

**Does**: Records, transcribes and hands its text to the Draft open when it stops, wherever the app goes.
**Props**: place: the Draft open
**Model**: count; listed; machines: whether each Machine is ready and answers; microphone: from Device State; notice
**States**: Idle | Starting | Recording | Transcribing | Failed | Done, each with its id
**Workers**: machines: always, from Machines; microphone: always, from Device State; asks: always, from Dictations; record, switch: while recording; transcribe: while transcribing; notice: while one shows
**Requires**: AiClients, Machines, DeviceState, Recorder, Dictations
**View**: the badge; its hooks give every Draft its line

### Decisions

- **It reads which Machines can transcribe from `Machines`**, because the Machine List already watches each Line and each Speech to Text. Caveat: none.

## home · settings · machines · harness-binaries · speech-to-text · shortcuts

Home and Machine Settings follow `Machines`. Each per-Machine Child gets its Machine by Input. Harness Binaries reads its Machine over `AiClients`. Speech to Text reads its state from `Machines` and switches it over `AiClients`. Shortcuts reads and writes the Bindings in Device State.

## project · session

**Does**: The new session's Draft and its start / the open Session: its transcript, Draft, send, `/btw`, fork and stop.
**Provides**: AiClient of `:machineId`, from AiClients, and SharedCatalog, from self (`project/capabilities/`), both project only
**Requires**: AiClients, Machines, Navigation / AiClient, Replicas, DeviceState
**Workers** (project): machine: always, Sends MachineKnown, so a Machine no longer listed says so in place of the page; harnesses, models, skills: the catalog, read over `AiClients` on its own Machine
**Children**: ProjectRow, and a draft while no session is open / SessionRow, Messages, earlier Messages each up the fork chain, and a draft keyed by the session, handed its agent and whether it runs

### Decisions

- **The Draft is one Actor, a Child of each page that has one**, because typing, picking and dictating then change only its own Model, and only it draws again. Caveat: its folder is in `project/`, and the session page reaches it by a Laymos Rule.
- **Code shared by Actors and not an Actor is a plain Module with no prefix**, in the lowest Actor folder that holds every user (`project/draft/`, `project/model-picker/`, `shell/connection/`, `shell/places/`), or in `src/` when the entry file or a service uses it too. Caveat: its users below reach it by a Laymos Rule, an import upward.

## project/draft

**Does**: Holds the next message of a page, a new session's first or a Session's next, and sends it.
**Input**: none
**Props**: machineId, projectId, to: NewSession, or Session with its id, its agent once read, and whether it runs
**Model**: text, attachments, insert: the last Insert; catalog, as the project shares it; chosen: the agent, model and settings picked; picking, opened; problem; starting; unsent, sends; asked, asks
**States**: none
**Messages**: Typed, AttachmentsChanged, InsertAsked, PickerOpened, SendAsked, AnswerDismissed, CatalogRetryAsked: its View; PickerClosed, SkillChosen, ModelChosen: its Pickers' Owners; CatalogRead: its Worker; Started, StartRefused, Sent, SendRefused, Answered, AskRefused: its Commands
**Commands**: startSession: ends with Started or StartRefused; send: ends with Sent or SendRefused; ask: ends with Answered or AskRefused; retryCatalog; Router.push
**Workers**: catalog: always, Sends CatalogRead
**Requires**: AiClient, SharedCatalog, Navigation
**Provides**: SkillPicker and ModelPicker Owners, at the top, from self
**Services**: none
**Children**: skills, models: Pickers, while picking, key: opened
**View**: why nothing can be sent or what went wrong, the `/btw` answer, the card and its Status Line; the page adds Stop and its own problem through `Slots`

### Decisions

- **A Session's Draft is keyed by its session**, because the session page stays as the URL moves between sessions. Caveat: a Draft not sent is gone when another session opens.
- **Stop is the session's, handed to the Draft's View through `Slots`**, because stopping a turn is not the Draft's errand. Caveat: a React context, not Props, since it carries a button.
