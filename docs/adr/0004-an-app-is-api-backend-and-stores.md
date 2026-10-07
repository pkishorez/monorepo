# An app is its API, its Backend, and what its client keeps; the toolkits own the rest

An app built on the kstack toolkits is laid out in the words a reader already has, and nothing else: the **API** it speaks, the **Backend** that answers it, and on the client what the screens use. The machinery behind them (sign-in on a device, switching accounts, deleting a signed-out user's Std Sync, the platform underneath) lives in the toolkits and shows only as imports.

- The Backend is one Layer of handlers that does not know where it runs. Each **service** it needs (a table, the token Resolver, later AI) has a `cloud` and a `device` version, imported from the service's own module. Which one is given decides where the Backend runs: on the Cloudflare Worker (**cloud**), or in the app itself (**device**). These replace "Remote Backend" and "Local Backend".
- The client keeps three things, each made where its scope starts and ended with it: the **Backend Link**, per Backend (how a session calls the API, and the platform its Std Sync runs on); the **Session**, per signed-in user (an RPC runtime signed as them, and a Std Sync named by their id, with its collections, read with TanStack DB as they are); and the **Cache**, per device (Settings), which belongs to no user.
- auth-toolkit's `createApp` decides only _when_: it opens the Backend Link when a Backend starts and the Session when a user becomes active, closes each on a switch, a sign-out or a change of Backend, and deletes a signed-out user's Std Sync. _What_ they hold is the app's plain code.
- web-toolkit and expo-toolkit each give a ready-made platform (`webPlatform`, `expoPlatform`): where tables are kept, the platform Std Sync runs on, cloud sign-in, and the device's memory, network and other tabs. An app no longer defines a platform.

## Considered Options

- **Declare the session (`defineSession`) and let a toolkit build the collections**: rejected. A Std Sync collection says how it fetches and how it writes; an API and a collection are not linked by themselves, and hiding that is magic a reader cannot follow.
- **Call a user's Std Sync a cache**: rejected. A user's data lives on the Backend; keeping it on the device is Std Sync's business. Cache means what only this device has.
- **Call the per-Backend part a backend store, holding a `copies` platform**: rejected. It is the client's link to a Backend, not a store, and Std Sync already calls what it runs on a platform: `BackendLink { api, syncPlatform }`.
- **Keep Remote and Local**: rejected. They say where the Backend is from the client's side; cloud and device say where it runs, which is what a reader needs to know.

## Consequences

- An app's core reads `api/`, `model/`, `backend/` (`backend.ts`, `handlers/`, `services/<name>/{index,cloud,device}`), and `app/` (`link/`, `session/`, `cache/`, and its own `commands/`, `places/`, `ledger.ts`).
- A web app reads `app.ts`, `routes/`, `screens/`, `worker.ts`, `infra/`, `styles.css`.
- A Backend chosen before this change (`remote`, `local`) is read as `cloud`, `device`.
