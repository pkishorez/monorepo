# DevTools Kabuki — Context

How a running Kabuki app shows up in DevTools: it connects as a Kabuki
Session and answers the eight calls, and DevTools, its CLI and a panel in
the page ask it only through them. Kabuki's own words (Snapshot, History,
History entry, Step, Branch, Head, Instance, Address, Runtime, Seek, Fork,
Time Travel, Timeline, Blueprint, Source, Fake, FakeWorld) are defined in the
[Kabuki context](../../packages/kabuki/CONTEXT.md); DevTools' in the
[DevTools context](../devtools/CONTEXT.md).

## Language

**Kabuki Session**:
One running Kabuki app connected to DevTools, under a name unique among the live ones. Two Apps in one tab are two Kabuki Sessions. It asks for a name, the page's `?kabuki-session`, else the one it is given, else the one this tab used before, else a readable one made up; DevTools answers the final one, with `-2`, `-3` added on a clash. Naming is the wire's business, not one of the eight calls. The app dials DevTools, then answers over that socket; DevTools keeps a Kabuki Session in memory only while its socket is open. Always "Kabuki Session", never bare "session": Session already means an Account's Session.
_Avoid_: tab, connection, client, session (on its own)

**Environment**:
Where a Kabuki Session runs, as DevTools groups them: the one `connect` is given, else the page's host (`localhost:5173`, a tunnel's host), else `default`, as on a server. DevTools lists Kabuki Sessions by app, then Environment; their names stay unique across both.
_Avoid_: host, origin, stage

**The eight calls**:
Everything a panel asks of one Kabuki Session, behind the `KabukiSession` Service: `blueprint`, `watch`, `look`, `travel`, `fork`, `send`, `fakes` and `control`. Answered in the page straight against the app and its FakeWorld, with nothing serialized, or through the DevTools Server, which passes each call to the tab over one RPC group; the two answer alike. The tab computes every answer, since only it has the Actors' code. An Instance is named by its Address; every value of the app's own is sent as its Actor's Schemas encode it, and taken back the same way: a Message or a control's payload arrives as plain JSON and the tab decodes it.
_Avoid_: Api, protocol, endpoint, methods

**Look**:
The Instances at one Step, as `look` answers them: each with its Address, its place in the Blueprint, its Actor, its State's tag, whether that Step started or changed it, and its Children; and, for the Instances asked to be opened, their data and Workers. A Step started an Instance it is in after and not before, and changed one whose State, Model or Props is another object after it. Which Workers run is known only at the Head of a running app.
_Avoid_: graph, snapshot (that is Kabuki's whole value), node

**Shape**:
One plain description of a Schema's encoded side, which a card reads to show a value and a form reads to fill one: text, a number, a switch, a choice of literals, a struct of fields, each with its name, whether it is optional or nullable, and its description, an array, or else JSON, named in words. Every Message's payload, every State's data, a Model, Props, a Fake's state and each control's payload have one. Not an Actor's Shape, which is Kabuki's word for what `Actor.define` gives.
_Avoid_: schema (that is the Effect value), form, type

**Attachment**:
A function Kabuki calls with each app it starts, which returns how to stop it; given through the app's `attach` option. `connect` makes one.
_Avoid_: plugin, hook, extension

**Inspector**:
This package's panel, Kabuki's Inspector: a Kabuki app of its own that reads and moves one Kabuki Session only through the eight calls, so it reads the same in the page, beside the app, and in DevTools. Three tabs. Running: the Instances at the Step shown, each a card, over the Timeline of the Branch in view, worked out from the entries' parents; picking a Step Time Travels the app, Now goes back to the Head, Fork carries on from the Step shown on a new Branch. A Step looked back at opens the card its Message was for. Blueprint: every Actor the root can grow, running or not, each a card of what it declares. World, only while `fakes` lists a Fake: each Fake's controls, each a form built from its payload's Shape that runs it with `control` and says done or why not, beside its state now, which follows `fakes`; the FakeWorld only moves forward, so nothing of it is a Step. Presenting, only the canvas, kept whole in view, with nothing to press. It keeps no History of its own.
_Avoid_: devtools (that is the Dock or the app), viewer, debugger

**Form**:
How `KabukiDevtools` places the Inspector beside an app. `dock`, the default: the Web Platform's Devtools Dock wraps the app and lays it out beside the panel, full screen, as a bar, a side panel or a floating window. `dialog`: the app is left as it is, untouched, and the Web Platform's Devtools Dialog beside it opens the panel full screen over it, for an app the Dock cannot lay out, such as one fixed to the screen. Both open from the same corner button and Ctrl+/ or ⌘/; the Dialog also closes with Escape.
_Avoid_: mode, layout (the Dock's word for where it puts the panel)

**Actions**:
The part of an open card that Sends the app a Message: every Message its Instance's Actor takes now, its top level's and its State's, worked out from the Blueprint and the State in the Look, each a form built from its payload's Shape. A blank optional field is left out and a blank nullable one is `null`. What came of it shows beside it: handled, ignored, queued, refused with the reason, or why it was not sent. While the Inspector shows a past Step, Actions offer only to go back to now.
_Avoid_: commands, buttons, controls (a Fake's word)
