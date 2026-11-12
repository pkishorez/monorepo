# DevTools Kabuki — Context

How a running Kabuki app shows up in DevTools: it connects as a Kabuki
Session, answers the Kabuki Session Api, and DevTools, its CLI and the
Inspector read it only through that Api. Kabuki's own words (Snapshot,
History, History entry, Step, Branch, Head, Instance, Address, Trail,
Runtime, Seek, Fork, Time Travel, Timeline, Branch in view, Inspector) are
defined in the
[Kabuki context](../../packages/kabuki/CONTEXT.md); DevTools' in the
[DevTools context](../devtools/CONTEXT.md).

## Language

**Kabuki Session**:
One running Kabuki runtime connected to DevTools, under a name unique among the live ones. Two Apps in one tab are two Kabuki Sessions. It asks for a name, the page's `?kabuki-session`, else the one it is given, else the one this tab used before, else a readable one made up; DevTools answers the final one, with `-2`, `-3` added on a clash. The app dials DevTools, then answers over that socket; DevTools keeps a Kabuki Session in memory only while its socket is open. Always "Kabuki Session", never bare "session": Session already means an Account's Session.
_Avoid_: tab, connection, client, session (on its own)

**Environment**:
Where a Kabuki Session runs, as DevTools groups them: the one `connect` is given, else the page's host (`localhost:5173`, a tunnel's host), else `default`, as on a server. DevTools lists Kabuki Sessions by app, then Environment; their names stay unique across both.
_Avoid_: host, origin, stage

**Kabuki Session Api**:
The Effect RPC group a Kabuki Session answers: who it is, its History, the Snapshot at a Step, what a Step changed, the graph the Inspector draws, the Blueprint, one Instance's card and its Trail, a stream of its changes and of the page it runs in, any Branch of the History and where it splits, and Seeking a Step in the app or Forking it. The tab computes every answer, since only it has the Actors' code, and reads Kabuki only as any tool does: the root's Blueprint, the History and its Branches, Snapshots and Trails, the Workers the data asks for and the ones its Runtime runs, and Addresses. An Instance is named by its Address; every value of the app's own is sent as its Actor's Schemas encode it. Served over the socket the app dials, or in memory to the in-page dock.
_Avoid_: protocol, session API, endpoint

**Blueprint**:
Every Actor an app's root can grow, read from the root's Blueprint, one node per Child slot, named by its place, whether it runs or not: each level's Messages, Workers, Children, Queries and the Capabilities it Provides, which each level declares, and the Actor's Requires. The Inspector's Blueprint tab draws it whole, or a level at a time.
_Avoid_: static tree, schema, map

**Attachment**:
A function Kabuki calls with each runtime it starts, which returns how to stop it; given through the app's `attach` option. `connect` given only its options is one.
_Avoid_: plugin, hook, extension
