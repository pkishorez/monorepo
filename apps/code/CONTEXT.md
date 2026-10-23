# code

The local app for running Coding Harness Sessions in Projects. Its records and their words come from the [[ai-toolkit]]; this file holds the words for how the app is worked.

## Language

**Picker**:
One way to choose something, made of Steps: choosing a row finishes it or opens the next Step, and going back drops one. The same Picker is drawn as a fuzzy list when opened by keys and next to its button when opened by pointer.
_Avoid_: palette, finder, chooser, menu, dropdown

**Step**:
One list in a Picker, searched by typing, such as the agents, a model's settings, or one folder's folders.
_Avoid_: page, screen, level

**Project Picker**:
The Picker for where to work next: recent Projects, then folders under home, where choosing a Project starts a new Session in it and a folder not yet added becomes a Project.
_Avoid_: add project, open project

**Machine Switcher**:
The Picker over the signed-in User's Machines, in place of the logo, showing which one the app is on. Nothing below it opens until a Machine is chosen. A Machine that stops answering stays open with what was last synced, marked by its Last Seen.
_Avoid_: machine gate, environment picker, connection list

**Machine List**:
The signed-in Account's Machines as this device last had them, kept per Account so the app opens on the last Machine even while the Backend is out of reach, then asked again every Heartbeat while the app is visible.
_Avoid_: machine registry, device list

**Session Switcher**:
The Picker over Sessions to go back to one, the most recently active first.
_Avoid_: session picker, quick open

**Session Actions**:
The Picker over what can be done to the open Session, such as Settling it, un-Settling it or Forking it from its latest Turn.
_Avoid_: command palette, session menu

**Unseen**:
A Session whose last Turn ended since it was last open on this device; opening it clears that. The device keeps an Unseen mark for each Session opened on it, per Machine, the end time of the last Turn it saw, so a Session never opened here is never Unseen. The sidebar draws it bold.
_Avoid_: unread, new, notification

**Device State**:
What this browser keeps for itself and no other device sees: the user's Bindings, Vim Mode, Unseen marks, and the Machine each Account was last on. The app draws nothing until it has been read.
_Avoid_: preferences, local settings, localStorage

**Settled List**:
Where the sidebar keeps Settled Sessions, ungrouped, the most recently Settled first.
_Avoid_: archive, trash
