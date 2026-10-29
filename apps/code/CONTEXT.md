# code

The local app for running Coding Harness Sessions in Projects. Its records and their words come from [[connect]] and the [[ai-toolkit]]; this file holds the words for how the app is worked.

## Language

**Picker**:
One way to choose something, made of Steps: choosing a row finishes it or opens the next Step, and going back drops one. It is drawn as the way it was opened asks, whatever the device: a fuzzy list in the middle when opened by keys, next to its button when opened by mouse, and in its Picker Mode when opened by touch; the rest of the screen dims behind it either way.
_Avoid_: palette, finder, chooser, menu, dropdown

**Picker Mode**:
How a Picker is drawn when opened by touch, or always on a device with no keyboard and no mouse, chosen by whoever opens it: a Drawer, rising from the bottom with a few choices and no search, or, tall, three quarters of the screen whatever it holds, a long list tapped through with no search; or a Sheet, a Drawer three quarters tall with its search box above the list, typed into only once tapped, when it rises over the on-screen keyboard. Every one closes by a swipe down or a tap on what it dims.
_Avoid_: tray, shade, sheet, bottom sheet

**Step**:
One list in a Picker, searched by typing, such as the agents, a model's settings, or one folder's folders. In a Picker Mode its title and a way back head it; a Step of a few choices, such as a setting's, shows no search there, and one that finishes on itself, such as a folder, has a button for it, and one on each row it can go into, to finish there at once, as Mod+Enter on the row highlighted does.
_Avoid_: page, screen, level

**Project Picker**:
The Picker for where to work next: first the Connection, a Step shown only while the Connection Filter shows every Connection and there is more than one, else skipped for the Connection it shows or the only one, then that Connection's recent Projects and the folders under its home, in a tall Drawer on touch. Choosing a Project opens its new Session's page, on a phone as on a wide screen, and a folder not yet added becomes a Project. A Project whose folder is missing shows so, as a row that cannot be chosen; its own page says so above its Draft, with Remove beside it, the only place a Project is removed, and starts no new Session there, while its Sessions stay readable. A new Session once started is shown on its own page, with nothing left over it, the sidebar on a phone included.
_Avoid_: add project, open project

**Connection List**:
The signed-in Account's Connections as this device last had them, kept per Account so the app opens with all of them even while Cloud Connect is out of reach, then asked again once, on Reload, and on each Recheck. The app holds a Link to every Connection in it at once, and the Setup of each, and shows their Projects and Sessions together. A Connection that stops answering keeps what was last synced, marked by its Last Seen; a Last Seen only as this device kept it is believed once Cloud Connect answers, or after a while without, and until then the Connection is only Linking.
_Avoid_: machine registry, device list, machine switcher

**Setup**:
What the app keeps of how one Connection in the Connection List is set up: its Harness Accounts, its Speech to Text, and its agents with their models. It shows as last kept, at once, and the Connection is asked again when its Link is up, on Reload, and after a change in Settings, which shows at once and is never undone by an answer asked before it. Settings and every Project read it; a Project's Skills are its own, kept for it the same way.
_Avoid_: machine kit, kit, machine cache, machine settings (as a store), catalog (for the per-Connection part)

**Storage**:
What this device keeps, in databases named by their place: the device's own, `code:device`; each Account's, `code:account:<accountId>`; and each of its Connections', under the Account's. The database says whose it is, the table what it is, and it is one of three kinds: Local, Cache or Sync. Whoever checks a level deletes the children it no longer lists, never itself, and only on a real answer: once the Auth Worker answers, every Account not signed in on this device goes, with all under it; once Cloud Connect first answers, every Connection of the Account it does not list goes, with all under it; a check that fails deletes nothing, and a later answer neither, since another tab may already list a Connection this one has not heard of. A Project removed and a Connection forgotten go at once, as the user asked.
_Avoid_: persistence, IndexedDB (for the idea), local storage

**Local**:
Storage only this device knows, and the truth: the Preferences, the Accounts signed in here, each Account's Connection Filter and the Connections its Sidebar shows collapsed, and each Connection's Unseen marks and Saved Drafts. Nothing asks for it again.
_Avoid_: device state, saved

**Cache**:
Storage of what Cloud Connect or a Connection last said, such as a Connection List, a Setup or a Project's Skills: shown at once, then asked again behind, the answer to the latest ask replacing it and kept in its place. Never the truth, and never synced. It goes with Whose it is.
_Avoid_: kept copy, saved copy, snapshot

**Sync**:
Storage of a copy the backend keeps up to date, live: each Connection's Projects, Sessions and Turns, as its Replicas hold them, in a Store of its own.
_Avoid_: replica store (for the idea), account replicas, mirror

**Shelf**:
One kind of Cache, by name, at a version of its shape, such as the Connection List or a Project's Skills. A copy kept at another version reads as nothing, and the next answer replaces it.
_Avoid_: table, store, bucket

**Whose**:
Whom a Cache is kept for: its Account, and its Connection and Project when it has them. Each is kept apart under it, and goes with it.
_Avoid_: owner, scope, key

**Link**:
The app's socket to one Connection, as it stands: linking, linked, or relinking. It dials the Connection's code Plugin at the [[connect]] Release this Code was built with, by its hash. Nothing can be sent to a Connection whose Link is not linked.
_Avoid_: line, socket status

**Mismatched**:
A Connection that closed its Link's socket at once, as it runs another Release of the code Plugin than this Code calls, until a socket to it is answered. What Cloud Connect wants it to run says who is behind: this Code's Release, or none, and the Connection is Updating, so the Link keeps relinking and the app says "Updating Connect…"; another, and this Code is Stale, so it moves to its newest build and says "Updating Code…".
_Avoid_: version mismatch, incompatible, refused (a refused call is a Message)

**Outdated**:
A Connection whose `ke-connect` is older than Cloud Connect accepts, the Minimum Connect. Its header and Settings ask to run `npm i -g @kestack/connect@latest` on it; a newer `ke-connect` being out is no reason to.
_Avoid_: old, behind (that is a Mismatched one)

**Recheck**:
The Connection List asked again because a Connection's Link is not up: every 3 seconds for the first minute, then every 30 seconds, until every Link is up; a Link that drops starts it again. Reload starts it over at once.
_Avoid_: poll, heartbeat (that is the Connection's own report)

**Connection Filter**:
The sidebar's choice of whose sessions it lists: every Connection, or one, each named by its short name as the sidebar names it, kept on this device per Account, in the Account's own database, since a Connection is its Account's; the Connections the Sidebar shows collapsed are kept beside it, alike. Only the Connections it shows are synced for the sidebar, and nothing is listed until it and the Connection List are read. Reload sits beside it.
_Avoid_: machine switcher, machine picker

**Settings**:
What the user sets, on no Connection, at one address, in three tabs side by side, chosen by name, or on touch by a sideways swipe the tabs follow, the one beside showing as it comes: General, the parts of Preferences a user sets; Shortcuts, the Bindings; and Connections, every Connection in the Connection List standing by its Line and Last Seen as the sidebar says them, with its own settings as its Setup holds them, changed only while its Line is connected, each change sent to the Connection and then shown by its Setup. Each Connection is forgotten from a bin beside its name, which asks first, and shows its Agents: its Harness Accounts and its Speech to Text. Projects are not set here: they are never managed. Its Harness Accounts are listed under each agent, each with the config folder it really uses, marked when Connect's environment chose it, as for a Default Account with none set; each opened to change it, one at a time, under its row, on touch as with keys, what is set there kept apart from what it resolves to. Which tab is open is Settings' own and has no address: they open on General, unless a link to them asks for another, as the Draft's for an agent that cannot run asks for Connections.
_Avoid_: options, config

**Sidebar**:
The Sessions listed by Project, each Project with its Sessions under it, hung from a thin guide line, the most recently active first, and the Projects in that order too. A Project's heading is its name and, in a git Project, the branch its folder is on, as its Sessions there last found it, one with no Worktree, as made before Worktrees, counted as there, quieter; anywhere on it or its + opens its new Session's page at once. A Session is one line: its title, then, only when its branch is not its heading's and it has a Worktree, so in practice its own, a Worktree mark and that branch, never the Worktree's folder, a branch Code made shown without its `ke-code/` prefix; then its status. While the Connection Filter shows every Connection and the Connection List has more than one, the Projects are by Connection first, each Connection named once over its Projects by its short name, the name it was served as (`demo-studio`, not `<host> (demo-studio)`), as the app names a Connection everywhere, small, uppercase and quieter than a heading, with a dot, green while linked, grey while not, and when it was last seen once it is out of reach. The Connections are in the order of their most recently active Session, but those out of reach go last, so a Connection going down or coming back moves its Projects, a trade-off taken so the Connections that answer stay on top. An out-of-reach Connection's Projects and Sessions are quieter and have no +, its Sessions still readable. A Connection's name, clicked, tapped or Entered, collapses its Projects under it, its chevron turned back, its dot dimmer and saying how many, as "(3 projects)", its name as readable as ever, and opens them again; which are collapsed is kept beside the Connection Filter, and the cursor and [ ] pass over what is hidden. With one Connection shown, no Connection is named. A Session shows in it only once it has started; a new Session's page puts nothing there.
_Avoid_: timeline, session list, project tree

**Branch Picker**:
The Picker on a new Session's page for the branch it works on. It opens from the Branch row over the Draft, under the Project's name and folder, which shows the branch in full and the origin branch it tracks; under it, the New Worktree switch says in a line what happens on send. Neither is in the Draft or its Status Line. Both are shown only when the Project is a git repository, one that is not saying so in a line, and the Picker starts on the branch the main Worktree is on. While the Session is Starting, its steps take their place. One list in two sections, Local and Origin: a local branch that tracks one on origin says so under its name, and that one is not listed again under Origin; an Origin branch picked is checked out locally first. Off, the default, the Session works on the branch where it is checked out, the main Worktree switching to it when no Worktree has it, and nothing is made. On, a new Worktree is made on send, on a new branch from the one picked, named `ke-code/<id>` at first and renamed `ke-code/<slug>` once, when the Session's first Title is written, unless it was pushed by then, a name taken getting `-2`; the Worktree's folder keeps the id. Nothing checks which branch other Sessions in a Worktree are on.
_Avoid_: env mode, checkout picker, workspace picker

**Starting**:
A new Session's page from its send until Connect has made the Session: its steps, such as making the Worktree, switching the branch and starting the agent, shown one by one where the transcript will be. Only once every step is done is there a Session, and the page is its page; a step that fails leaves no Session, and the page as it was, its Draft back and the failure said.
_Avoid_: pending session, creating, loading

**Session Switcher**:
The Picker over Sessions to go back to one, the most recently active first.
_Avoid_: session picker, quick open

**Actions**:
The Picker over what can be done where the user is, opened by `?` or the header's button: what can be done to the open Session, such as Settling it, un-Settling it or Forking it from its latest Turn, and every Action of the keyboard that works there. Each row shows its keys, out of Vim Mode and in it, and is searched by name or by key. Choosing a row does the Action, as pressing its keys would. Changing keys is Settings' business, not its.
_Avoid_: command palette, session menu, keys picker, help sheet, cheat sheet

**Unseen**:
A Session whose last Turn ended since it was last open on this device; opening it clears that. The device keeps an Unseen mark for each Session opened on it, per Connection, the end time of the last Turn it saw, so a Session never opened here is never Unseen. The sidebar draws it bold.
_Avoid_: unread, new, notification

**Vim Mode**:
The keyboard-first way of working the app, off until turned on in this browser, and off with its status line on a device with no keyboard, however wide its screen: plain keys are shortcuts in the page's Normal Mode, the Draft is read until `i` makes it the Composer, or, while the Question Panel stands in for it, `i` or `m` expands that, and the keys' status line is at the app's foot. Off, the Draft is a text box as any other, and only keys holding Ctrl, Alt or Cmd are shortcuts.
_Avoid_: keyboard mode, power mode

**Layout**:
What is drawn around every page for the Account drawn: the sidebar, the header with the mic, and the Pickers the keys open anywhere: the Project Picker, the Session Switcher and Actions. It reads the Preferences and holds the keys, Vim Mode, the Window and the Text Size, binds the keys that start a Dictation, and starts over when another Account is drawn.
_Avoid_: frame, chrome, app shell (that is the library's)

**Window**:
The app floating as a window over a backdrop of its own on a screen wider than it can be, off until turned on in Settings in this browser, for demos. Off, the app fills the screen at every width.
_Avoid_: portal, inset, layout (that is what is drawn around every page)

**Text Size**:
How big the text and spacing are with a keyboard on a wide screen: small, medium, a little under the browser's own and the default, or large, the browser's own. Chosen in Settings in this browser. A touch screen keeps the browser's size.
_Avoid_: density, zoom, scale

**Preferences**:
The Local Storage of this browser, what it keeps for itself and no other device sees: the user's Bindings, whether Vim Mode is on, the Window, the Text Size, the sidebar's width, the Microphone chosen, and whether the Touch Draft takes Smart Input and Smart Displacement. The Connection Filter, and which Connections the Sidebar shows collapsed, are each Account's, and go with it; the Unseen marks are each Connection's, and go with it; each Draft is kept apart, as its Saved Draft, with its Connection; and what Connections said is kept apart, as each Setup. Signed in, the app is drawn only once they have been read, all at once, so it draws whole.
_Avoid_: device state, local settings, localStorage

**Draft**:
The open Session's next message, kept at the foot of the page with the Status Line while the transcript scrolls above it, always visible but while the Question Panel stands in for it. It is written in one Draft Mode at a time. With a keyboard and out of Vim Mode it is typed into as any text box is; in Vim Mode it can be read, scrolled and clicked to place a cursor or select, but not typed into until it is the Composer. On a device with no keyboard it is the Touch Draft. A Dictation, while it is turned into text, shows as transcribing where its text will go. Everything the user adds, such as a Dictation, a paste, a file or a Skill, goes in at the cursor of the Draft Mode open, replacing any selection, and the page brings that spot into view. Sending it makes it the Session's next message, or, in Side Question mode, asks the Side Question. Until it is sent it is kept on this device as its Saved Draft.
_Avoid_: input, insert bar, prompt box, composer (that is the Draft while editable)

**Saved Draft**:
A Draft as it shows, kept on this device for its Session, or for its Project's new session, so it comes back as it was left: what is saved is what is shown, the Draft Mode open, each mode's text, cursor and selection, the Message's files, and the agent, model and settings picked. Kept for the Account the Draft was opened under, even if another is switched to before it goes, and never synced: the last save wins. It is saved a moment after each change and as the page is left; a Draft that shows nothing has none. Sending clears what was sent from the Draft and so from its Saved Draft; a refused send comes back into the Draft while it is open, but one refused after the page was left is lost. A new session's is kept while the session starts, and goes, the picks with it, once it has started. It is kept with its Connection, and goes with it: with its Project removed or its Connection forgotten, as the user asks, and with its Connection no longer listed or its Account signed out of this device, as everything kept of them does. A Dictation still recording is not part of it, and what the whole device keeps is Preferences.
_Avoid_: autosave, local draft, cached draft

**Draft Mode**:
One way the Draft is written: a Message, the Session's next message with its files, Skills and the model picked, or, in a Session, a Side Question. Each keeps its own text, cursor and selection, so switching away and back finds it as it was left. The Side Question toggle in the Draft, or its keys, switches between them; Escape and "Back to session" return to the Message. Nothing typed switches it: only the toggle and its keys do. A new session's Draft has only the Message.
_Avoid_: tab, composer mode, input mode

**Side Question**:
A question about the open Session, asked on the side and answered by the Session's own agent without interrupting it or entering its transcript. Text only: no file or Skill goes with it, and no model is picked. While the Draft is in Side Question mode, the question asked and how it stands, being answered, answered or failed, takes the transcript's place, and the answer can be copied. A new one replaces the last and its answer; nothing of it is kept.
_Avoid_: aside, ask, side chat

**Question Panel**:
Where the open Session's Agent Question is answered, standing in for its Draft from the moment its agent asks until the question is answered, skipped, or its Turn ends: the Draft cannot be reached by click, tap, key or focus meanwhile, and comes back as it was, its Saved Draft untouched. It lives in the page's content column, never over the sidebar or the header, which work as ever while it waits, and is in one of two states, kept for each question, with its answers so far, while it is asked, however often the user opens another session or page meanwhile. Expanded, a question's first state, it is a dialog of steps over the transcript, which is dimmed behind it, on touch a sheet from the column's foot: one Item a step, its header, its question, "Choose one" or "Choose any", and its options as rows, round for one choice and square for several; where its agent allows, "Other", a row like any other until it is edited, a secret's hidden as it is typed. Its head says who asks, which step of how many, a segment each, filled once answered, with Stop while the Turn runs; its foot has Next, or, on the last step, Send, Back, and "Skip question", which asks once more, then lets the agent carry on without an answer. Send sends nothing while an Item is left, but goes to its step and marks it. Minimised, by its button, `m`, Escape, a click on the transcript behind it, a swipe down on touch, or Ctrl+Y, it is a bar in the Draft's place, "Claude asks · 1 of 2 answered", with Stop, Skip and Open, and the transcript is the page's again; the bar, Ctrl+Y, or `m` or `i` in Vim Mode, which never open the model Picker or the Composer while it stands in, expand it. Its Session's row in the sidebar says "Question" while it waits.
_Avoid_: question drawer, question form, modal, wizard

**Expanded**:
The Question Panel as a dialog of steps over the transcript, with the keys, its plain ones in either Mode, focus being in it: `j` and `k` or the arrows through the choices, a single one chosen as it is reached; Ctrl+J and Ctrl+K, `l` and `h`, Tab and Shift+Tab through the steps; Space or `x` to choose, or let go of one of several; 1 to 9 for an option; Enter to go on, or send on the last; `i` to edit one's own answer, Escape to leave it, Enter to leave it and go on; Mod+Enter to send from any step; `q`, then `q` or Enter, to skip; `m`, or Escape, to minimise.
_Avoid_: open, maximised

**Minimised**:
The Question Panel as a bar where the Draft sits, the question still asked and its answers so far kept, so the transcript above can be read, scrolled and opened by pointer, touch and keys.
_Avoid_: closed, collapsed, dismissed

**Touch Draft**:
The Draft on a device with no keyboard: a sheet at the foot of the page, edge to edge, with the model chip and Text | Voice on top, a few lines of the Draft read only under them, and a row that never moves: Skills and Quick actions on the left, the talk bar in the middle, Send on the right. In voice, tapping the words places the cursor and the talk bar dictates: tap to talk, Waiting, quiet, while the Microphone opens, a tap letting it go, then tap again to take it, or Send to take it and send the Draft once it is text; Cancel throws it away, and a failed one is tried again or thrown away from the same place. In text, tapping the words makes it the Composer. A Swipe on the words switches between them; voice can't be chosen while no Connection can transcribe. Which one it is, is kept in Preferences. It is resting, recording, transcribing, being edited or sending; what it holds is the Draft's text, not one of these.
_Avoid_: mobile composer, mobile input

**Composer**:
The Draft while the user is editing it: the same place, now typed into. With a keyboard and out of Vim Mode the Draft always is; in Vim Mode, or on a device with no keyboard, leaving it makes the Draft read-only again.
_Avoid_: input, editor

**Dictation**:
Speech from the moment the user starts talking to the moment they stop, turned into text and put in at the Draft's cursor as if typed, replacing any selection. Once in, it is plain text like any other. It starts anywhere, Settings included, by its keys, the header's mic or a Draft's, and carries on while the user goes elsewhere in the app or switches Draft Mode. Each Draft on screen says it is where text goes, the last one drawn winning; the text goes to the Draft on screen when it stops, into the Draft Mode open, and with none, into the Dictation List. It is Waiting while the Microphone is asked for and not yet live, as while the browser asks for permission, said in a word where its recording will show, and Recording only once it is live; asked again while Waiting, it lets go. The sound itself is never sent to the agent, so a Dictation is not an Attachment.
_Avoid_: voice message, voice note, recording, transcript

**Dictation List**:
The texts of Dictations that stopped with no Draft on screen, or whose Draft left before the text came, kept in the corner of the screen until each is pasted into the Draft on screen or thrown away. Not kept on this device.
_Avoid_: inbox, clipboard, history

**Microphone**:
The audio input of this browser a Dictation records from: the system default, or one chosen in the Microphone Picker and kept in Preferences. One chosen that is not connected leaves the default to record.
_Avoid_: input device, audio device, mic setting

**Microphone Picker**:
The Picker over this browser's Microphones, the system default first, the one chosen checked. Choosing one while a Dictation records records the rest of it from the new one.
_Avoid_: device picker, mic menu

**Status Line**:
The one line at the foot of the page: the model and permissions in effect, and the ways to add to the Draft and send it. Wherever the app says which agent runs, here, on the model chip, in the model Picker and beside a Session's title, the agent is its logo, then its Harness Account's name unless it is the Default Account: the Claude logo, then "Work · Opus 5.5". Where only words go, it is one: "Claude", or "Claude-Work".
_Avoid_: footer, toolbar

**Settled List**:
Where the sidebar keeps Settled Sessions, the most recently Settled first, opened under "Settled", last in the timeline, and closed by it again.
_Avoid_: archive, trash
