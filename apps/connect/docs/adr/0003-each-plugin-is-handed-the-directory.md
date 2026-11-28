# Each Plugin is handed the Directory, and may reach every Plugin

A Plugin never signs in or calls Connect Cloud. `ke-connect` already learns,
on its Heartbeat, every Computer of the User, each one's Enabled Plugins and
how to reach their API and MCP; it hands that to each Plugin Server it runs as
its Kabuki props, the Directory, again on each Heartbeat that changes it, and
the App hands the same to each Plugin UI. What
a Plugin does with it is its own business. While every Plugin is ours, nothing
asks the User's permission: any Plugin on any of the User's Computers may call
any other Plugin's API or MCP. Third-party Plugins, or sharing a Computer,
would end this and bring permissions with them.

## Considered Options

- Each Plugin calls a read-only part of Connect Cloud's API itself. Rejected:
  every Plugin would need the Sign-in, or `ke-connect` would have to sign its
  calls, to learn what the Heartbeat already told `ke-connect`.
