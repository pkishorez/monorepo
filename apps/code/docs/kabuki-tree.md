# code actor tree

`code` runs Claude Code and Codex Sessions in Projects, on every Machine of
the signed-in Account at once. Its root is a Page, drawn only in the
browser. The app Layer gives it the Accounts, the Cloud Connect client,
the Replica Store, Device State, the saved Machine Lists, the Saved
Drafts, `Machines`, the Recorder and `Dictations`. Each Actor reads only what it shows, so a change
draws only the part that shows it.
Changed through `/kabukifi`; edit by hand and it drifts.

## Tree

```
src/
  app.tsx  keys.ts                             entry file, and the keyboard
  shell/                                        the root page; router.ts, sign-in.tsx
    actors/   sidebar · header · dictation · moves (plain)
      pickers/  project-picker · session-switcher · session-actions ·
                microphone-picker · keys-picker
    pages/    home · settings (general, shortcuts, machines) · project (session)
    machines/                                   reaching every Machine; machine-list
    routes/                                     the address of every page
  layer/      capabilities/ · services/         what the app Layer gives
  ui/                                           used by the entry file and the tree
  deploy/     infra/                            the server, not the browser app
```

`actors/`, `actors/pickers/` and `pages/` are Wrappers: they say the kind,
so an Actor's folder has no prefix.

```
shell                                   root; Provides CurrentAccount, Replicas, CodeClients, Moves
│                                       States: Reading | Ready
├── (account, replicas)                 always; library Actors
├── machines/machine-list               Ready, while signed in; key: account id
├── actors/sidebar                      Ready, always
├── actors/header                       Ready, always
├── actors/pickers/project-picker       Ready, always
├── actors/pickers/session-switcher     Ready, always
├── actors/pickers/session-actions      Ready, always
├── actors/pickers/microphone-picker    Ready, always
├── actors/pickers/keys-picker          Ready, always
├── actors/dictation                    Ready, always
├── pages/home                          while the URL names it
├── pages/settings                      /settings, which alone redirects to General
│   ├── general                         /general
│   ├── shortcuts                       /shortcuts; holds Shortcuts, always
│   └── machines                        /machines
│       ├── harness-accounts            each: Account and listed Machine id; Provides AccountList
│       │   └── card                    each: account id, and `new` while one is added
│       └── speech-to-text              each: Account and listed Machine id
└── pages/project                       /m/:machineId/p/:projectId; Provides CodeClient, SharedCatalog, Picker Owners
    ├── draft                           while no session is open: the new session's
    │   ├── mode                        each: Message
    │   └── touch                       always
    └── session                         /s/:sessionId
        └── draft                       key: the session id
            ├── mode                    each: Message, SideQuestion
            └── touch                   always
```

Every Picker made by `Picker.make`, every Replica Query and the Account
Switcher are Actors from a library or a factory. They have no folder of
their own.

## How it connects

Down, from the root: what each level gives the one below.

```
app Layer ─ Accounts, Store, AccountReplicas, CloudClient, DeviceState,
            SavedMachines, SavedDrafts, Machines, Recorder,
            Dictations ────────────────────────────────────────▶ shell
shell ─ Provides CurrentAccount, Replicas, CodeClients, Moves ▶ everything below
shell ─ Input: accountId; Props: email ──────────────────────▶ machine-list
shell ─ Props: place (the Draft open) ───────────────────────▶ header, dictation
shell ─ Props: bindings ────────────────────────▶ session-actions, keys-picker
project ─ Provides CodeClient of :machineId, SharedCatalog ───────▶ session
draft ─ Provides TouchDraft.owner ───────────────────▶ touch
draft ─ Input: its text as written; Props: mode, reset ▶ mode
machines ─ each Account and id; Input: machineId, accountId ▶ harness-accounts, speech-to-text
harness-accounts ─ each key; Provides AccountList; Props: account ▶ card
```

Up, from the leaves: what each level asks of the one above, and what runs.

```
machine-list ─ publishes into Machines ─────────────▶ sidebar, Pickers, Dictation, pages
sidebar, Settings, home ─ Request Machines.reload / forget ─▶ machine-list
any Picker ─ Request Owner.done / load / settle ──────────▶ the Actor that holds it
session ─ Request SharedCatalog.retry ───────────────▶ project
touch ─ Request Owner.send ──────────────────────────▶ draft
sidebar, session-actions ─ put, into Moves ─────────▶ each Session's Machine
shell ─ Command askDictation, into Dictations ───────▶ dictation
machine-list ─ Worker: recheck, while a Line is down ▶ Sends RecheckDue
sidebar ─ Worker: moves, from Moves ────────────────▶ Sends MovesShown, MoveRefused
```

## shell

**Does**: Holds the app for the Account signed in, and every part that lives on every page.
**Input**: none
**Model**: account: who is signed in, kept across States; signInProblem: why signing in failed; back: where Settings were opened from
**States**: Reading: nothing is drawn, the Bindings are read (BindingsRead → Ready); Ready: bindings, the keys; BindingsRead again when they change
**Messages**: BindingsRead: a Worker; Signed: the accounts Worker; SignInAsked, SignInFailed: the View, signIn; NewSessionAsked: the `n` key; SettingsToggled: Ctrl+, and Escape; DictationAsked: Space, Ctrl+Space, the mic button, a Draft
**Commands**: signIn: ends with SignInFailed or nothing; keepAccounts: once Accounts are signed in, and each time one is signed out, keeps only their records, Machine settings and Saved Drafts; askDictation: ends with nothing; Router.push
**Workers**: accounts: always, at the top, Sends Signed; read: in Reading, Sends BindingsRead; bindings: in Ready, Sends BindingsRead when the Bindings change
**Requires**: Navigation, DeviceState, Accounts, Store, SavedMachines, SavedDrafts, AccountReplicas, Machines, Dictations
**Provides**: CurrentAccount, at the top, from the Account Switcher; Replicas and CodeClients, at the top, from `machines/reach.ts`; Moves, at the top, from `actors/moves/`
**Services**: reach: holds a Machine's Instance only while it is listed, and dials each Machine at its listed address
**Children**: account, replicas: always; machine-list: in Ready, while signed in, key the account id; the other Actors in the Tree: in Ready, always
**View**: Reading: nothing. Ready: signing in while nobody is signed in; else the App Shell, with each part handed its own Instance

### Decisions

- **The root keeps only the account, the Bindings and `back`**, because every other datum is read by one part, and the root's View draws the whole frame. Caveat: each Child follows its own source, so the same source is read by more than one Worker.
- **Bindings are a State's data, not Model**, because they exist only once read, and nothing is drawn before. Caveat: none.
- **`Replicas`, `CodeClients` and `Moves` are root Provides, not the app Layer's**, because `Replicas.child` is a root Child and the library pairs them. Caveat: the root's own Workers cannot use them; none needs to.
- **The router is the root's, in `src/shell/router.ts`**, read down from the root's definition and handed out by its door as `Shell.router`. Caveat: none.
- **Dictation asks go through the `Dictations` queue the root fills**, because the asks come from Views across the tree, and `Took` comes from the Draft's editor, which holds no Dictation handle. Caveat: it is a parent reaching a Child by a side channel.

## machine-list

**Does**: Holds one Account's Machines and a Line to each.
**Input**: accountId
**Model**: accountId; machines: the list, null before any; fetchedAt; fetching; problem; forgetting; lines: each Machine's Line; speech: each Machine's Speech to Text; rechecks: how many Rechecks since every Line was up
**States**: none
**Messages**: Saved, Fetched, Failed: its Workers; ReloadAsked: Reload, through Machines; RecheckDue: the recheck Worker; LineChanged, SpeechWatched: its Workers; ForgetAsked, ForgetDismissed: Settings, through Machines; Forgot, ForgetFailed: forget
**Commands**: save: ends with nothing; forget: ends with Forgot or ForgetFailed; keep: keeps only the records, settings and Saved Drafts of the Machines on the first list; drop: deletes a forgotten Machine's records, settings and Saved Drafts
**Workers**: saved: while no list; fetch: while fetching; lines, speech: each listed Machine; recheck: while not fetching and a Line is not up, waits 3 seconds for the first 20, then 30, Sends RecheckDue; publish: always, into Machines; requests: always, from Machines
**Requires**: CloudClient, SavedMachines, SavedDrafts, AccountReplicas, Link, CodeClients
**Provides**: none · **Services**: none · **Children**: none
**View**: on home, how to start a Machine while there is none, or why the list cannot be read

### Decisions

- **The Machine List and the Lines are one Actor**, because a Recheck depends on the Lines, and both follow the same list. Caveat: its Model changes as a download's progress arrives; only what reads that part draws again.
- **The list is asked again only on Reload and on Recheck, not on a timer**, because a list with every Line up has nothing new to say. Caveat: a Machine's Last Seen goes stale while every Line is up; nothing reads it then.
- **The list reaches others through `Machines`, an app-Layer Capability, not as Props**, because its readers are its siblings and a new Account gives a fresh Instance. Caveat: each reader picks its own part and drops the rest.

## sidebar

**Does**: Lists the Projects and Sessions of the Machine Filter's Machines.
**Input**: none
**Model**: machines: ids and names, null before any list; problem; chosen: the Machine Filter, from Device State; unseen: the Unseen marks; moving: where each Session put goes, as `Moves` says; told: the last swipe, to say with its Undo; refused: the last Move refused; refusals: how many of each Session's Moves were refused
**States**: none
**Messages**: MachinesKnown, DeviceRead: its Workers; MachineChosen, ReloadAsked, SessionOpened, MoveAsked, MoveSeen: its View; MovesShown, MoveRefused: the moves Worker
**Commands**: setSidebarMachine: ends with nothing; reload: ends with nothing; putMove, agreed: into Moves, end with nothing; Router.push
**Workers**: moves: always, Sends MovesShown and MoveRefused, from Moves; known: always, Sends MachinesKnown when ids or names change; device: always, Sends DeviceRead
**Requires**: Machines, DeviceState, Moves, Navigation
**Provides**: none · **Services**: none
**Children**: projects, sessions: Replica Queries, each: the Machines shown
**View**: the Machine Filter and Reload, the Projects and their Sessions, the Settled List

### Decisions

- **The sidebar is an Actor, not a View of the root**, because its Projects, Sessions and marks change often and only it shows them. Caveat: the Project Picker's plus is handed in through a React context, `Slots`.
- **Only the Machines shown are read**, because a Machine not shown has nothing to draw here. Caveat: its rows sync again when it is shown.
- **Settling and Un-settling go through `Moves`, a root Provide, not a Worker of the sidebar**, because Session Actions settles too, and each Session's Moves must be asked in order whatever asked them. Caveat: the sidebar draws each Session where `Moves` says it goes until the Session as synced agrees, so a late update flickers for a moment.

## header

**Does**: Reads the rows of the project and the session the URL names.
**Input**: none · **Props**: place
**Model**: none · **States**: none · **Messages**: none · **Commands**: none · **Workers**: none
**Requires**: none · **Provides**: none · **Services**: none
**Children**: project: ProjectRow, while a project is open; session: SessionRow, while a session is open
**View**: the title, and the open session's agent and model

## project-picker · session-switcher · session-actions · microphone-picker · keys-picker

**Does**: Each owns one Picker: `model.picking` opens it, and `opened` keys a fresh Instance each time.
**Props**: none / none / bindings / none / bindings
**Workers**: machines, always, and recent, while open / sessions, while open / session, while open / inputs and chosen, while open / none
**Requires**: CodeClients, Navigation, Replicas, Machines / Navigation, Replicas, Machines / CodeClients, Moves, Navigation, Replicas / Recorder, DeviceState / none
**Provides**: its Picker's Owner, from self
**Children**: picker, while open, key: opened
**View**: its Picker, and a Button or a Notice where one is drawn

### Decisions

- **A Picker is a `while` Child keyed by `opened`, not a State**, because open and closed hold the same data. Caveat: the owner's Model carries a counter.
- **The Project Picker follows the Machines always**, because its first Step is chosen as it opens. Caveat: one Worker runs while it is closed.
- **The Keys Picker is opened with the Actions that worked, and its View runs the one chosen**, because the keyboard knows them only in React, and only before the Picker takes it. Caveat: the Model carries the Action chosen until the View has run it.

## dictation

**Does**: Records, transcribes and hands its text to the Draft open when it stops, wherever the app goes.
**Props**: place: the Draft open
**Model**: count; listed; machines: whether each Machine is ready and answers; microphone: from Device State; notice
**States**: Idle | Starting | Recording | Transcribing | Failed | Done, each with its id
**Workers**: machines: always, from Machines; microphone: always, from Device State; asks: always, from Dictations; record, switch: while recording; transcribe: while transcribing; notice: while one shows
**Requires**: CodeClients, Machines, DeviceState, Recorder, Dictations
**View**: the badge; its hooks give every Draft its line

### Decisions

- **It reads which Machines can transcribe from `Machines`**, because the Machine List already watches each Line and each Speech to Text. Caveat: none.

## home · settings · general · shortcuts · machines · harness-accounts · speech-to-text

Settings is a page of three pages, drawn as tabs beside the one open. General reads and writes Device State; the Microphone is chosen through the Microphone Picker's `Opener`. The Shortcuts page holds the Shortcuts Actor, which reads and writes the Bindings in Device State. Home and Machine Settings follow `Machines`; Machine Settings draws each Machine's Line and Last Seen from the shell's `Connection`, as the sidebar does. Each per-Machine Child, keyed by its Account and Machine and none while no Account is known, gets them by Input, reads what `SavedMachines` kept of it first, and keeps what the Machine says. Harness Accounts reads its Machine's accounts over `CodeClients`, and asks again when a card changes one before the Machine answers; each card saves or removes its own and tells the list through `AccountList`. Speech to Text reads its state from `Machines` and switches it over `CodeClients`. Their Views lock them while the Machine's Line is not connected.

### Decisions

- **A Machine's settings are kept beside the Machine List, in `SavedMachines`, not in Kabuki**, because they belong to the Account and the Machine, as the list does. Caveat: their rows are pruned by the Machine List's `keep` and `drop` and the root's `keepAccounts`, as Replicas are, so a Machine gone from a later list keeps its row until the next first list.
- **Shortcuts is a page that holds the Shortcuts Actor**, so the editor stays an Actor its test draws alone. Caveat: one level more than General and Machines.

## project · session

**Does**: The new session's Draft and its start / the open Session: its transcript, Draft, send, Side Questions, fork and stop.
**Provides**: CodeClient of `:machineId`, from CodeClients, and SharedCatalog, from self (`project/capabilities/`), both project only
**Requires**: CodeClients, Machines, Navigation, SavedDrafts (a Project removed takes its Saved Drafts) / CodeClient, Replicas, DeviceState
**Workers** (project): machine: always, Sends MachineKnown, so a Machine no longer listed says so in place of the page; harnesses, models, skills: the catalog, read over `CodeClients` on its own Machine
**Children**: ProjectRow, and a draft while no session is open / SessionRow, Messages, earlier Messages each up the fork chain, and a draft keyed by the session, handed its agent and whether it runs

### Decisions

- **The Draft is one Actor, a Child of each page that has one**, because typing, picking and dictating then change only its own Model, and only it draws again. Caveat: its folder is in `project/`, and the session page reaches it by a Laymos Rule.
- **Code shared by Actors and not an Actor is a plain Module with no prefix**, in the lowest Actor folder that holds every user (`project/capabilities/catalog/`, `actors/moves/`, `shell/machines/`, `shell/routes/`), or in `src/` when the entry file or a service uses it too. Caveat: its users below reach it by a Laymos Rule, an import upward.

## project/draft

**Does**: Holds the next message of a page, a new session's first or a Session's next, and sends it.
**Input**: none
**Props**: machineId, projectId, to: NewSession, or Session with its id, its agent once read, and whether it runs
**Model**: restored: its Saved Draft read back; changes, kept: how many changes there were to keep, and how many are kept; mode: the Draft Mode open; written: each mode's text and selection, as last written; resets, reset: the text each mode was last set to; attachments, insert: the last Insert; catalog, as the project shares it; chosen: the agent, model and settings picked; picking, opened; problem; starting; unsent, sends; asked, asks
**States**: none
**Messages**: Written, ModeAsked, AttachmentsChanged, InsertAsked, PickerOpened, SendAsked, CatalogRetryAsked: its View; PickerClosed, SkillChosen, ModelChosen: its Pickers' Owners; SendAsked: also the Touch Draft's Owner; CatalogRead, Restored, Kept: its Workers; Started, StartRefused, Sent, SendRefused, Answered, AskRefused: its Commands
**Commands**: startSession: ends with Started or StartRefused; send: ends with Sent or SendRefused; ask: ends with Answered or AskRefused; forget: its Saved Draft, once a Message is sent, ends with nothing; retryCatalog; Router.push
**Workers**: catalog: always, Sends CatalogRead; restore: until read back, Sends Restored; save: each change to keep, while no send is on its way, a quarter of a second after it, Sends Kept; flush: once read back, as the page is hidden or left and as the Draft goes, Sends Kept
**Requires**: CodeClient, SharedCatalog, Navigation, SavedDrafts
**Provides**: SkillPicker and ModelPicker Owners, and `TouchDraft.owner`, at the top, from self
**Services**: none
**Children**: modes: a Draft Mode each, the Side Question only in a Session, once its Saved Draft is read back; touch: the Touch Draft, always; skills, models: Pickers, while picking, key: opened
**View**: nothing until its Saved Draft is read back; then why nothing can be sent or what went wrong, the card and its Status Line showing the mode open; in Side Question mode the question and its answer, where the page says; the page adds Stop, its own problem and that place through `Slots`

### Decisions

- **A Session's Draft is keyed by its session**, because the session page stays as the URL moves between sessions. Caveat: none now; a Draft not sent comes back from its Saved Draft.
- **The Saved Draft is kept by the Draft's own Workers, through `SavedDrafts`, an app-Layer Capability**, because only the Draft knows when it changed, and the store must outlive it. Caveat: a Session's Saved Draft goes with its Project, Machine or Account; the app learns of no single Session forgotten, so none goes alone.
- **Stop is the session's, handed to the Draft's View through `Slots`**, because stopping a turn is not the Draft's errand. Caveat: a React context, not Props, since it carries a button.
- **Each Draft Mode is a Child, and the Draft keeps a copy of each one's text as written**, because a mode owns its text, cursor and selection, while the Draft acts on them: it sends, asks and sets them. The Draft's one editor hands each edit to both, and the Draft sets a mode's text by a numbered reset the mode takes once. Caveat: the edit reaches the mode through its View, which says how in `Edits`, as the Touch Draft's View hands the Draft its send.

## project/draft/mode

**Does**: Keeps one Draft Mode's text, cursor and selection.
**Input**: its text and selection, and the last reset that holds already · **Props**: mode, reset: the text the Draft last set it to
**Model**: written, reset: the last reset taken · **States**: none
**Messages**: Edited, ResetTaken: its View · **Commands**: none · **Workers**: none
**Requires**: none · **Provides**: none · **Services**: none · **Children**: none
**View**: nothing; says in `Edits` how an edit reaches it, and takes a reset
