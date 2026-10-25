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
The Picker for where to work next: first the Machine, a Step skipped while there is only one, then that Machine's recent Projects and the folders under its home, in a tall Drawer on touch, where choosing a Project starts a new Session in it and a folder not yet added becomes a Project.
_Avoid_: add project, open project

**Machine List**:
The signed-in Account's Machines as this device last had them, each with its settings as it last said them, kept per Account so the app opens with all of them even while Cloud Connect is out of reach, then asked again once, on Reload, and on each Recheck. The app holds a Line to every Machine in it at once, and shows their Projects and Sessions together. A Machine that stops answering keeps what was last synced, marked by its Last Seen.
_Avoid_: machine registry, device list, machine switcher

**Line**:
The app's socket to one Machine, as it stands: connecting, connected, or reconnecting. Nothing can be sent to a Machine whose Line is not connected.
_Avoid_: connection, link

**Recheck**:
The Machine List asked again because a Machine's Line is not up: every 3 seconds for the first minute, then every 30 seconds, until every Line is up; a Line that drops starts it again. Reload starts it over at once.
_Avoid_: poll, heartbeat (that is the Machine's own report)

**Machine Filter**:
The sidebar's choice of whose sessions it lists: every Machine, or one, kept in Device State. Only the Machines it shows are synced for the sidebar. Reload sits beside it.
_Avoid_: machine switcher, machine picker

**Settings**:
What the user sets, on no Machine, in three pages chosen by tabs: General, the parts of Device State a user sets; Shortcuts, the Bindings; and Machines, every Machine in the Machine List standing by its Line and Last Seen as the sidebar says them, with its own settings, shown as the Machine last said them and asked again behind, and changed only while its Line is connected.
_Avoid_: preferences, options, config

**Session Switcher**:
The Picker over Sessions to go back to one, the most recently active first.
_Avoid_: session picker, quick open

**Keys Picker**:
The Picker over the Actions that work where the user is, opened by `?`: each row the Action's name, its keys out of Vim Mode and in it, the set in effect marked, searched by name or by key. Choosing a row does the Action, as pressing its keys would. Changing keys is Settings' business, not its.
_Avoid_: help sheet, cheat sheet, shortcuts dialog, command palette

**Session Actions**:
The Picker over what can be done to the open Session, such as Settling it, un-Settling it or Forking it from its latest Turn.
_Avoid_: command palette, session menu

**Unseen**:
A Session whose last Turn ended since it was last open on this device; opening it clears that. The device keeps an Unseen mark for each Session opened on it, per Machine, the end time of the last Turn it saw, so a Session never opened here is never Unseen. The sidebar draws it bold.
_Avoid_: unread, new, notification

**Vim Mode**:
The keyboard-first way of working the app, off until turned on in this browser, and off with its status line on a device with no keyboard, however wide its screen: plain keys are shortcuts in the page's Normal Mode, the Draft is read until `i` makes it the Composer, and the app floats as a window with the keys' status line at its foot. Off, the Draft is a text box as any other, and only keys holding Ctrl, Alt or Cmd are shortcuts.
_Avoid_: keyboard mode, power mode

**Device State**:
What this browser keeps for itself and no other device sees: the user's Bindings, whether Vim Mode is on, the Microphone chosen, whether the Touch Draft is written by text or by voice, the Machine Filter and the Unseen marks. The app draws nothing until the Bindings have been read.
_Avoid_: preferences, local settings, localStorage

**Draft**:
The open Session's next message, kept at the foot of the page with the Status Line while the transcript scrolls above it, always visible. With a keyboard and out of Vim Mode it is typed into as any text box is; in Vim Mode it can be read, scrolled and clicked to place a cursor or select, but not typed into until it is the Composer. On a device with no keyboard it is the Touch Draft. A Dictation, while it is turned into text, shows as transcribing where its text will go. Everything the user adds, such as a Dictation, a paste, a file or a Skill, goes in at its cursor, replacing any selection, and the page brings that spot into view. Sending it makes it the Session's next message.
_Avoid_: input, insert bar, prompt box, composer (that is the Draft while editable)

**Draft Mode**:
What the Draft is for at the moment: a Message, the Session's next message, or a Side Question. Each mode keeps its own text, cursor and selection, and the page around the Draft follows the mode it is in. A Session reopened is in the mode it was left in.
_Avoid_: composer mode, state, tab

**Side Question**:
A question put to the Session on the side and forgotten once answered: answered by the Session's own agent, never part of the transcript, and replaced by the next one. While the Draft is in this mode the page shows the Side Question and its answer in place of the transcript; leaving the mode brings the transcript back. Typing `/btw` at the start of a Message turns the Draft into this mode.
_Avoid_: btw, by the way, aside, ask

**Touch Draft**:
The Draft on a device with no keyboard: a sheet at the foot of the page, edge to edge, with the model chip and Text | Voice on top, a few lines of the Draft read only under them, and a row that never moves: Skills and Quick actions on the left, the talk bar in the middle, Send on the right. In voice, tapping the words places the cursor and the talk bar dictates: tap to talk, tap again to take it, or Send to take it and send the Draft once it is text; Cancel throws it away, and a failed one is tried again or thrown away from the same place. In text, tapping the words makes it the Composer. A Swipe on the words switches between them; voice can't be chosen while no Machine can transcribe. Which one it is, is kept in Device State. It is resting, recording, transcribing, being edited or sending; what it holds is the Draft's text, not one of these.
_Avoid_: mobile composer, mobile input

**Composer**:
The Draft while the user is editing it: the same place, now typed into. With a keyboard and out of Vim Mode the Draft always is; in Vim Mode, or on a device with no keyboard, leaving it makes the Draft read-only again.
_Avoid_: input, editor

**Dictation**:
Speech from the moment the user starts talking to the moment they stop, turned into text and put in at the Draft's cursor as if typed, replacing any selection. Once in, it is plain text like any other. It carries on while the user goes elsewhere in the app, and its text goes to the Session open when it stops, into the Draft Mode it is in then. The sound itself is never sent to the agent, so a Dictation is not an Attachment.
_Avoid_: voice message, voice note, recording, transcript

**Microphone**:
The audio input of this browser a Dictation records from: the system default, or one chosen in the Microphone Picker and kept in Device State. One chosen that is not connected leaves the default to record.
_Avoid_: input device, audio device, mic setting

**Microphone Picker**:
The Picker over this browser's Microphones, the system default first, the one chosen checked. Choosing one while a Dictation records records the rest of it from the new one.
_Avoid_: device picker, mic menu

**Status Line**:
The one line at the foot of the page: the model and permissions in effect, and the ways to add to the Draft and send it.
_Avoid_: footer, toolbar

**Settled List**:
Where the sidebar keeps Settled Sessions, the most recently Settled first, opened under "Settled", last in the timeline, and closed by it again.
_Avoid_: archive, trash
