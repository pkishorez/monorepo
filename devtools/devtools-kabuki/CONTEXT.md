# DevTools Kabuki — Context

How a running Kabuki app shows up in DevTools: it connects as a Kabuki
Session and answers the nine calls, and DevTools, its CLI and a panel in
the page ask it only through them. Kabuki's own words (Snapshot, History,
History entry, Step, Branch, Head, Instance, Address, Runtime, Seek, Fork,
Time Travel, Timeline, Blueprint, Source, Change, Chain, Work report,
Settled, Fake, FakeWorld) are defined in the
[Kabuki context](../../packages/kabuki/CONTEXT.md); DevTools' in the
[DevTools context](../devtools/CONTEXT.md).

## Language

**Kabuki Session**:
One running Kabuki app connected to DevTools, under a name unique among the live ones. Two Apps in one tab are two Kabuki Sessions. It asks for a name, the page's `?kabuki-session`, else the one it is given, else the one this tab used before, else a readable one made up; DevTools answers the final one, with `-2`, `-3` added on a clash. Naming is the wire's business, not one of the nine calls. The app dials DevTools, then answers over that socket; DevTools keeps a Kabuki Session in memory only while its socket is open. Always "Kabuki Session", never bare "session": Session already means an Account's Session.
_Avoid_: tab, connection, client, session (on its own)

**Environment**:
Where a Kabuki Session runs, as DevTools groups them: the one `connect` is given, else the page's host (`localhost:5173`, a tunnel's host), else `default`, as on a server. DevTools lists Kabuki Sessions by app, then Environment; their names stay unique across both.
_Avoid_: host, origin, stage

**The nine calls**:
Everything a panel asks of one Kabuki Session, behind the `KabukiSession` Service: `history`, `step`, `look`, `preview`, `fork`, `send`, `world`, `control` and `blueprint`. Answered in the page straight against the app and its FakeWorld, with nothing serialized, or through the DevTools Server, which passes each call to the tab over one RPC group; the two answer alike. The tab computes every answer, since only it has the Actors' code. An Instance is named by its Address; every value of the app's own is sent as its Actor's Schemas encode it, trimmed where it is long, and taken back the same way: a Message or a control's payload arrives as plain JSON and the tab decodes it. A value is shown, in the panel and to an agent alike, by one printer, as indented `key: value` lines.
_Avoid_: Api, protocol, endpoint, methods

**History**:
The History as `history` streams it: each entry sent once, after a cursor the caller holds, an epoch and an id. An entry is light: who Sent what to whom, its outcome, and whether it changed anything; what it did is its Step. Each batch says where the app is now, its epoch, the entries after the cursor and the entries the History's start is followed by now; a caller keeps only the entries that grow from those, so a Compacted History needs no new epoch. The epoch changes when the History is no longer what was sent and more, as when it is started over or loaded; a batch in a new epoch holds every entry kept, and replaces what the caller held. Forking keeps the epoch: the old Branch is still in the History.
_Avoid_: feed, log, timeline (that is what the Inspector draws from it)

**Step**:
One Step as `step` answers it: the tree of Instances after it, each with its Address, Actor, slot, key, State's tag, the Workers it wants and what it Provides; the Message it played, encoded, with the Commands it asked for, none at the History's start; and its Change, worked out in the tab by replay. At the Head, also the Work report, known only there.
_Avoid_: snapshot (that is Kabuki's whole value), frame

**Look**:
One Instance at one Step, whole, as `look` answers it: its State's data and Model as its Actor's Schemas encode them, not trimmed, its Props, its Actor's description and States, the Workers it wants, live only at the Head, what it Provides, and the Messages it takes, from its State or always, each with its payload's Shape.
_Avoid_: graph, node, detail

**Plan**:
One place in the root's Blueprint, as `blueprint` answers it, with nothing running: its path, the root's name then each Child's slot, after the State it is written in and a `:` when it is written in one, as in `App/Inside:downloads/files`, which is an Instance's Address without its keys and counts; its Actor and description; the Shapes of its Input, Model and Props; its States, each with its data's Shape; the Messages it takes, each with its description and its payload's Shape; its Workers, Queries and what it Provides, each at the top or in the State it is written in; its Emits and Requires; and its Children by slot, each with its own Plan. An Actor that is its own Child below is not grown again: that Plan names the path it repeats and has no Children.
_Avoid_: tree, node, schema

**Shape**:
One plain description of a Schema's encoded side, which a card reads to show a value and a form reads to fill one: text, a number, a switch, a choice of literals, a struct of fields, each with its name, whether it is optional or nullable, and its description, an array, or else JSON, named in words. Every Message's payload, every State's data, a Model, Props, a Fake's state and each control's payload have one. Not an Actor's Shape, which is Kabuki's word for what `Actor.define` gives.
_Avoid_: schema (that is the Effect value), form, type

**Attachment**:
A function Kabuki calls with each app it starts, which returns how to stop it; given through the app's `attach` option. `connect` makes one.
_Avoid_: plugin, hook, extension

**Inspector**:
This package's panel, Kabuki's Inspector: a Kabuki app of its own that reads and moves one Kabuki Session only through the nine calls, so it reads the same in the page, beside the app, and in DevTools. One Board: the Instances at the Step shown, each a card showing what that Step changed, the Message as a chip above the card that took it, which opens how it got there, over the Timeline of the Branch in view, worked out from the entries' parents. Picking a Step reads it with `step` and leaves the app at its Head unless the preview setting is on; Fork carries on from the Step shown on a new Branch. Opening a card reads its Instance whole with `look`, with its Actions. Presenting, only the Board, with nothing to press. It keeps no History of its own.
_Avoid_: devtools (that is the Dock or the app), viewer, debugger

**Form**:
How `KabukiDevtools` places the Inspector beside an app. `dock`, the default: the Web Platform's Devtools Dock wraps the app and lays it out beside the panel, full screen, as a bar, a side panel or a floating window. `dialog`: the app is left as it is, untouched, and the Web Platform's Devtools Dialog beside it opens the panel full screen over it, for an app the Dock cannot lay out, such as one fixed to the screen. Both open from the same corner button and Ctrl+/ or ⌘/; the Dialog also closes with Escape.
_Avoid_: mode, layout (the Dock's word for where it puts the panel)

**Actions**:
The part of an open card that Sends the app a Message: every Message its Instance's Actor takes now, its top level's and its State's, as its Look says, each a form built from its payload's Shape. A blank optional field is left out and a blank nullable one is `null`. What came of it shows beside it: handled, ignored, queued, refused with the reason, or why it was not sent. While the Inspector shows a past Step, Actions offer only to go back to now.
_Avoid_: commands, buttons, controls (a Fake's word)
