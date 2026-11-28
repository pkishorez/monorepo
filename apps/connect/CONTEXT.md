# Connect

Connect lets one person reach their own Computers from any of their devices,
and use the Plugins those Computers run. It has three parts: `ke-connect` on
each Computer, Connect Cloud, and the Connect App. Each part's own words are
in [connect/CONTEXT.md](connect/CONTEXT.md) and
[cloud/CONTEXT.md](cloud/CONTEXT.md); decisions are in [docs/adr/](docs/adr/).

## Language

### The parts

**Computer**:
A machine the User has set up `ke-connect` on, so it can be reached from
anywhere; the App lists it by name, such as Ada-MacBook. A second `ke-connect`
on the same machine, as a developer runs one, is another Computer.
_Avoid_: Connection (in this sense), host, server, machine, device

**ke-connect**:
The program that makes a machine a Computer: it signs in, opens the tunnel,
reports to Connect Cloud and runs the Computer's Plugins.
_Avoid_: daemon, agent, Connect server

**Connect Cloud**:
Where every Computer reports itself and the User is checked: it knows the
User's Computers, how to reach each, and which Plugins they run.
_Avoid_: backend, control plane

**Connect App**:
What the User opens on any device, the Computer itself included, to reach
their Computers and use their Plugins; the App for short.
_Avoid_: client, portal, dashboard, frontend

**Link**:
An open line from a caller, a Plugin UI or another Plugin, to one Plugin on
one Computer, made by the caller from a Directory address.
_Avoid_: connection, session, socket

**Computer Filter**:
Which Computers the App shows Plugins for: All, or one Computer. An opened
Plugin gets a Link to each Computer in it that runs the Plugin; a Plugin that
works on one Computer at a time is opened only once one is picked.
_Avoid_: connection filter, scope, selection

**Account Settings**:
What the User sets once, kept in Connect Cloud: their Computers and which
Plugins each runs.
_Avoid_: global settings, preferences

**Computer Settings**:
What is set for one Computer, kept on that Computer: its name and each of its
Plugins' own settings, in that Plugin's data. They never pass through
Connect Cloud.
_Avoid_: local settings, device settings

**User**:
The one person a Computer belongs to: only they, signed in, reach it.
_Avoid_: owner, member, customer

### Plugins

**Plugin**:
One piece of functionality a Computer offers, always ours: a Plugin Server on
the Computer and, optionally, a Plugin UI in the App, each its own Kabuki app.
_Avoid_: app, module, extension, integration

**Plugin Server**:
A Plugin's side on the Computer, which `ke-connect` runs: it exposes the
Plugin's API, its MCP, or both, as much of each as the Plugin chooses.
_Avoid_: engine, backend, daemon, Computer side

**Plugin Status**:
What a Plugin Server says of itself as it runs, as a stream: Starting, with
the step it is on; Ready; or Failed, with why. Its latest travels in the
Heartbeat, so every Directory entry carries it. Its log is apart, for the
Status Page.
_Avoid_: health, state, readiness

**Enabled Plugin**:
A Plugin the User turned on for one Computer, which that Computer downloads
and runs. Each Computer's Plugins are chosen on their own, never for every
Computer at once.
_Avoid_: installed, active, global plugin

**Plugin API**:
The Effect RPC a Plugin Server exposes, called by its Plugin UI over a Link
and by another Plugin that depends on its definition.
_Avoid_: backend, endpoint

**Plugin MCP**:
The MCP a Plugin Server exposes for agents. For now only an agent Connect
itself runs, such as KE Code's or KE Bot's, may call it.
_Avoid_: tools server, agent API

**Directory**:
Every Computer of the User and each one's Enabled Plugins at their Release,
with a ready address for each Plugin's API (`/rpc`) and MCP (`/mcp`): the
tunnel URL and Key for another Computer, the local socket for this one. A
Plugin gets it as Kabuki props, again on every Heartbeat that changes it.
_Avoid_: registry, context, catalog, world

**Plugin UI**:
A Plugin's own screens, built into the App and loaded only when first
opened. A Plugin may have none.
_Avoid_: frontend, plugin page, micro-frontend

**Status Page**:
The page the App draws the same way for every Plugin on a Computer: whether
it runs, crashed or is missing something, its logs, and enable or disable.
All a Plugin with no Plugin UI shows.
_Avoid_: fallback page, admin page

**Independent Plugins**:
Each Computer's Plugin knows only its own data; Connect never copies one
Computer's Plugin data to another. A Plugin UI that shows several Computers
asks each one and joins the answers itself.
_Avoid_: replicated, synced, shared plugin

**Catalog**:
Every Plugin Connect Cloud offers, each at its latest Release.
_Avoid_: registry, store, marketplace

**Release**:
One build of a Plugin Server, which each Computer that runs the
Plugin downloads from Connect Cloud. The App opens a Plugin only on a
Computer running its latest Release, so a Computer behind shows it as
updating until its next Heartbeat.
_Avoid_: version, bundle
