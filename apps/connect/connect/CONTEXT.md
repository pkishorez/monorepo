# Connect

How a computer is connected to the cloud so its User can reach it from anywhere: `ke-connect` signs in, opens a tunnel, reports its Heartbeat to Connect Cloud, and runs the Plugins Connect Cloud enables for it. Connect Cloud's own words are in [../cloud/CONTEXT.md](../cloud/CONTEXT.md).

## The story

1. `ke-connect serve` takes the **control socket**, so one name runs once on a computer, and opens `ke-connect.db`.
2. **Connect · SigningIn.** It uses the saved Sign-in, or signs in with a device code the first time.
3. **Connect · SignedIn.** The **Tunnel** opens the local port, holds the **Key**, and starts the Cloudflare tunnel to the port.
4. The **Heartbeat** reports the **Address** to Connect Cloud, which answers with the **Enabled Plugins**.
5. One **Plugin** runs per Enabled Plugin, and every call to `/<plugin>/<sha256>/rpc` that carries the Key is passed to it.
6. Signed out, everything below Sign-in stops and Connect signs in again. Removed, Outdated or stopped, Connect is **Stopped** and `ke-connect` ends.

## The tree

```
Connect                                          (root)
├── in every State
│   └── worker control                           answers `status` and `stop` on the control socket
│       └── sends StopRequested                  → Stopped{Requested}
├── SigningIn { who | null }
│   └── worker signIn                            the saved Sign-in, else a device code; claims the Connection
│       ├── sends SignedIn { who }               → SignedIn
│       └── sends SignInFailed { reason }        → Stopped{Failed}
├── SignedIn { who }
│   ├── worker heartbeat                         a Report every 15s, and at once on a new Address
│   │   ├── sends EnabledPluginsChanged          stays; one Plugin per name@sha
│   │   ├── sends SignedOut                      → SigningIn{who}
│   │   ├── sends ConnectionRemoved              → Stopped{Removed}
│   │   └── sends CliOutdated { line }           → Stopped{Outdated}
│   ├── child Tunnel
│   │   ├── emits TunnelAddressChanged           stays; the Heartbeat reports at once
│   │   └── emits TunnelFailed { reason }        → Stopped{Failed}
│   └── child Plugin × name@sha
└── Stopped { why }                              Requested | Removed | Outdated{line} | Failed{reason}

Tunnel
├── in every State
│   ├── worker server                            the local port; checks each call's Key
│   │   ├── sends PortOpened { port, key }       emits TunnelAddressChanged
│   │   └── sends PortFailed { reason }          emits TunnelFailed
│   ├── worker cloudflared                       one per opening, restarted by a new one
│   │   ├── sends TunnelUp { url }               → Active; emits TunnelAddressChanged
│   │   └── sends TunnelDown                     → SettingUp; opened again
│   └── worker keyRotation                       a new Key every hour
│       └── sends KeyRotated { key }             emits TunnelAddressChanged
├── SettingUp
└── Active { url, reachable }
    └── worker reachability                      calls its own URL through Cloudflare every minute
        ├── sends TunnelReachable                reachable = true
        └── sends TunnelUnreachable              reachable = false; the third in a row → SettingUp

Plugin
├── Starting, Running
│   └── worker run                               download, check the sha, start, wait until ready, watch
│       ├── sends PluginStarted                  → Running
│       ├── sends PluginStartFailed { log }      → Crashed
│       └── sends PluginExited { code, log }     → Crashed
└── Crashed { retryAt, log }
    └── worker backoff                           the wait doubles with each crash in a row
        └── sends BackoffEnded                   → Starting
```

## The model

Each Actor's Model is what it is and how it runs, both fixed from its
Input, then the few facts its Messages change.

```text
Connect
├── connection                 what this Connection is
│   ├── name                   its name on this computer: main
│   ├── computerName           how the App lists it: Ada-MacBook
│   ├── cloud                  the Connect Cloud it reports to
│   └── version                this ke-connect's, sent in each Report
├── settings                   how it runs
│   ├── heartbeatEvery         between Reports
│   ├── firstRetryAfter        the first wait before signing in again or restarting a crashed Plugin; it doubles each time
│   ├── tunnel                 handed to the Tunnel as its Input
│   └── pluginHome             where each Plugin gets its own place
│       ├── data, state, cache each Plugin's folder is <folder>/<name>
│       └── sockets            each Plugin's socket is <prefix><name><suffix>: a unix socket, or a named pipe on Windows
├── address                    the Tunnel's last URL and Key
├── plugins                    what Connect Cloud enabled and this computer can run, name → Release
└── signIn                     when it last signed in, and how often Connect Cloud refused it soon after

Tunnel
├── settings
│   ├── port                   the local port; any free one when 0
│   ├── origins                browser pages allowed to call
│   ├── reachEvery             between calls to its own URL
│   └── rotateKeyEvery         between new Keys
├── listening                  the port open now
├── key                        the Key callers need now
├── opening                    which cloudflared start this is
└── unreachable                failed reach checks in a row

Plugin
├── name, release
├── home                       its folders, socket and log file
├── firstRetryAfter
├── crashes                    in a row
└── startedAt
```

## Language

**Connect**:
The `ke-connect` program on a computer and the root Actor that runs it: signed in, reachable through its Tunnel, running its Plugins.
_Avoid_: daemon, agent, server

**Connection**:
One running Connect on a computer, signed in as one User to one Connect Cloud, with its own name there, kept with its id in `ke-connect.db`.
_Avoid_: machine, device, host

**Sign-in**:
The saved proof of who the User is, in `ke-connect.db`, made by a device code and reused on every start.
_Avoid_: login, session, token

**Tunnel**:
The Cloudflare quick tunnel to the Connection's local port, and the Actor that holds the port, the Key and the tunnel.
_Avoid_: proxy, gateway

**Address**:
The Tunnel's URL and the current Key: how an App reaches the Connection. Its URL is null while the tunnel is setting up.
_Avoid_: endpoint, location

**Key**:
The secret every call must carry, as the `key.<key>` subprotocol on a WebSocket or the `ke-connect-key` header on HTTP. One at a time, new on every start and every hour; a socket open when it changes stays open.
_Avoid_: token, password

**Reachable**:
Whether Connect could call its own URL from outside, through Cloudflare. A tunnel up but unreachable three times in a row is opened again.
_Avoid_: health, online

**Heartbeat**:
The Report sent to Connect Cloud every 15 seconds, and at once when the Address changes. Its answer is the only thing that says which Plugins run.
_Avoid_: ping, poll

**Enabled Plugins**:
The Plugins Connect Cloud says this Connection runs, each at one Release. A name that cannot be a folder or socket name, or would make a socket path too long, is never run.
_Avoid_: wanted, assigned

**Plugin**:
A program Connect runs beside itself, serving one Effect RPC group over HTTP and WebSocket on the socket Connect gives it. It imports `@kestack/connect/plugin`. Anything else it serves, it serves itself and hands out through its RPC.
_Avoid_: module, app

**Release**:
One build of a Plugin, named by the sha256 of its one file. A new Release is a new Plugin child; the old one stops first, so two never share a data folder.
_Avoid_: version

**Plugin data**:
A Plugin's own folder, `plugins/<name>/` in the Connection's data folder, the same for every Release. Connect makes it and never reads, changes or deletes it, unless `remove --delete-data` says so.
_Avoid_: storage, cache

**Backup**:
A copy of `ke-connect.db`, made with `VACUUM INTO` the first time each version of `ke-connect` opens it, the last three kept.
_Avoid_: snapshot

**Stopped**:
Connect's last State, with why: Requested, Removed, Outdated with Connect Cloud's line, or Failed with a reason. `ke-connect` exits 0, 1, 75 or 1.
_Avoid_: ended, exited
