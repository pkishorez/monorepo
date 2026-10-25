# code

The local app for running Coding Harness Sessions in Projects. Its records and their words come from the [[ai-toolkit]]; this file holds the words for how the app is worked.

## Language

**Picker**:
One way to choose something, made of Steps: choosing a row finishes it or opens the next Step, and going back drops one. It is drawn as the way it was opened asks, whatever the device: a fuzzy list in the middle when opened by keys, next to its button when opened by mouse, and in its Picker Mode when opened by touch; the rest of the screen dims behind it either way.
_Avoid_: palette, finder, chooser, menu, dropdown

**Picker Mode**:
How a Picker is drawn when opened by touch, chosen by whoever opens it: a Drawer, rising from the bottom with a few choices and no search; or a Dialog, at the top with its search box above the list, typed into only once tapped. A Dialog appears and goes without motion.
_Avoid_: tray, shade, sheet, bottom sheet

**Step**:
One list in a Picker, searched by typing, such as the agents, a model's settings, or one folder's folders. In a Picker Mode its title and a way back head it; a Step of a few choices, such as a setting's, shows no search there, and one that finishes on itself, such as a folder, has a button for it.
_Avoid_: page, screen, level

**Project Picker**:
The Picker for where to work next: first the Machine, a Step skipped while there is only one, then that Machine's recent Projects and the folders under its home, where choosing a Project starts a new Session in it and a folder not yet added becomes a Project.
_Avoid_: add project, open project

**Machine List**:
The signed-in Account's Machines as this device last had them, kept per Account so the app opens with all of them even while the Backend is out of reach, then asked again once, on Reload, and on each Recheck. The app holds a Line to every Machine in it at once, and shows their Projects and Sessions together. A Machine that stops answering keeps what was last synced, marked by its Last Seen.
_Avoid_: machine registry, device list, machine switcher

**Line**:
The app's socket to one Machine, as it stands: connecting, connected, or reconnecting. Nothing can be sent to a Machine whose Line is not connected.
_Avoid_: connection, link

**Recheck**:
The Machine List asked again because a Machine's Line is not up: every 3 seconds for the first minute, then every 30 seconds, until every Line is up; a Line that drops starts it again. Reload starts it over at once.
_Avoid_: poll, heartbeat (that is the Machine's own report)

**Machine Filter**:
The sidebar's choice of whose Projects it lists: every Machine, or one, kept in Device State. Only the Machines it shows are synced for the sidebar. Reload sits beside it.
_Avoid_: machine switcher, machine picker

**Session Switcher**:
The Picker over Sessions to go back to one, the most recently active first.
_Avoid_: session picker, quick open

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
What this browser keeps for itself and no other device sees: the user's Bindings, whether Vim Mode is on, the Microphone chosen, the Machine Filter and the Unseen marks. The app draws nothing until the Bindings have been read.
_Avoid_: preferences, local settings, localStorage

**Draft**:
The open Session's next message, kept at the foot of the page with the Status Line while the transcript scrolls above it, always visible. With a keyboard and out of Vim Mode it is typed into as any text box is; in Vim Mode it can be read, scrolled and clicked to place a cursor or select, but not typed into until it is the Composer. On a device with no keyboard it is the Touch Draft. A Dictation, while it is turned into text, shows as transcribing where its text will go. Everything the user adds, such as a Dictation, a paste, a file or a Skill, goes in at its cursor, replacing any selection, and the page brings that spot into view. Sending it makes it the Session's next message.
_Avoid_: input, insert bar, prompt box, composer (that is the Draft while editable)

**Touch Draft**:
The Draft on a device with no keyboard: a few lines of it, read only, beside the microphone, its one main button. Tapping that starts a Dictation; while it records, tapping it again takes the Dictation and swiping it up takes it and sends the Draft once it is text, and a small cancel throws it away. With text and nothing recording, swiping the microphone up sends the Draft. It is resting, recording, transcribing, being edited or sending; what it holds is the Draft's text, not one of these.
_Avoid_: mobile composer, mobile input

**Composer**:
The Draft while the user is editing it: the same place, now typed into. With a keyboard and out of Vim Mode the Draft always is; in Vim Mode, or on a device with no keyboard, leaving it makes the Draft read-only again.
_Avoid_: input, editor

**Dictation**:
Speech from the moment the user starts talking to the moment they stop, turned into text and put in at the Draft's cursor as if typed, replacing any selection. Once in, it is plain text like any other. It carries on while the user goes elsewhere in the app, and its text goes to the Session open when it stops. The sound itself is never sent to the agent, so a Dictation is not an Attachment.
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
Where the sidebar keeps Settled Sessions, ungrouped, the most recently Settled first.
_Avoid_: archive, trash
