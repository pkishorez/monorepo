# Platforms may break; the Toolkits keep what persists

An app is built on two tiers, and they change at different speeds. The area Toolkits (rpc-, auth- and std-toolkit) own what outlives a release: tables, the sign-in service and its database, and the wire contract between client and server. A mistake there loses or leaks data, so they change carefully. The Platform Toolkit and the two Platforms (`@kstackz/web-platform`, `@kstackz/expo-platform`) own only what a user can lose without harm: which Accounts the device remembers, the device's Settings, which Backend was chosen last. A mistake there costs a reload or a sign-in, so they may break, and move fast.

- **platform-toolkit** holds the platform-free rules of running an app: the Gate, each Account's Session (`defineSession`, interrupted when it closes, with a Session Status), named APIs (`Api.http`, `Api.websocket`), the device Backend per API, and the Host a Platform gives. The Gate and `createApp` leave auth-toolkit, whose client door keeps only the Sign-in mechanisms.
- **web-toolkit and expo-toolkit become the Web and Expo Platforms**, in `platforms/`. Each has one door, `createApp`, that turns one config (name, APIs, device Backend, auth with its Session, cache) into an app with the Host, the Theme, the screens before sign-in and the named sign-in dialog given. The Web Platform's `server` door has `createServer`, which serves each API on its cloud services and checks every call with the sign-in service.
- **Every web app is a PWA.** The Web Platform turns it on; an app that wants no service worker uses the Toolkits directly.
- **Versions.** The Toolkits stay in one fixed version (ADR 0002). platform-toolkit and the Platforms each keep their own, so a breaking Platform release is a major of that Platform alone, and an app reverts one by pinning the version before it. Each Platform changeset says what an app changes.

## Considered Options

- **The Gate in each Platform, two copies free to differ**: rejected. The Gate's rules (Open First, Account Lost, sign-outs heard across tabs) are hard-won and the same on both; two copies would drift.
- **The Gate staying in auth-toolkit**: rejected. It knows Transports, Std Sync and the Backends, which are an app's concerns, and it tied auth-toolkit's careful release cadence to code that should move fast.
- **The PWA opt-in, as ADR 0003 had it**: rejected. Every app wanted it, and opting in was one more thing to know.
- **Platforms in the fixed version**: rejected. A Platform's breaking release would read as a major of std-toolkit and auth-toolkit, which did not change.

## Consequences

- Platforms list the Toolkits as peers, so a Toolkit release still republishes them; only their version numbers move apart.
- Nothing a Platform writes reaches a table or the sign-in service except through a Toolkit's door. A change that would is a Toolkit change and goes through the Toolkits' care.
- The Gate's memory keeps its table (`auth-gate`) and database (`gate`), so devices keep their Remembered Accounts across the move.
- ADR 0003's "Gate in auth-toolkit" and "PWA opt-in", and ADR 0005's `createApp` in auth-toolkit, are superseded here.
