# DevTools Kabuki — Context

How a running Kabuki app shows up in DevTools: it connects as a Kabuki
Session, answers the Kabuki Session Api, and DevTools, its CLI and the
Inspector read it only through that Api. Kabuki's own words (Snapshot,
History, Step, Entry, Branch, Head, Instance, Inspector) are defined in
the [Kabuki context](../../packages/kabuki/CONTEXT.md); DevTools' in the
[DevTools context](../devtools/CONTEXT.md).

## Language

**Kabuki Session**:
One running Kabuki runtime connected to DevTools, under a name unique among the live ones. Two Apps in one tab are two Kabuki Sessions. It asks for a name, the page's `?kabuki-session`, else the one it is given, else the one this tab used before, else a readable one made up; DevTools answers the final one, with `-2`, `-3` added on a clash. The app dials DevTools, then answers over that socket; DevTools keeps a Kabuki Session in memory only while its socket is open. Always "Kabuki Session", never bare "session": Session already means an Account's Session.
_Avoid_: tab, connection, client, session (on its own)

**Kabuki Session Api**:
The Effect RPC group a Kabuki Session answers: who it is, its History, the Snapshot at a Step, what a Step changed, the graph the Inspector draws, one Instance's card, a stream of its changes, and travelling or forking the app. The tab computes every answer, since only it has the Actors' code; every value of the app's own is sent as its Actor's Schemas encode it. Served over the socket the app dials, or in memory to the in-page dock.
_Avoid_: protocol, session API, endpoint

**Attachment**:
A function Kabuki calls with each runtime it starts, which returns how to stop it; given through the app's `attach` option. `connect` given only its options is one.
_Avoid_: plugin, hook, extension
