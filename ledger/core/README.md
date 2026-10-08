# @ledger/core

Everything Ledger's web and Expo apps share: the API and the named APIs, the model, the Backend (handlers on services, each with a cloud and a device version, and the device Backend), each user's Session, the device's cache, Commands and Places. Platform-free; each app hands these to its Platform's createApp.

## Big picture

Ledger runs in a browser ([`@ledger/web`](../web)) and natively on a phone
([`@ledger/expo`](../expo)). Everything below their screens lives here once,
so the two apps cannot drift: the same Backend, Users, Settings and Commands.
The words are in [`../CONTEXT.md`](../CONTEXT.md), the decisions in
[`../docs/adr/`](../docs/adr/); the split into core, web and Expo is ADR 0010,
and the layout below is the root
[ADR 0004](../../docs/adr/0004-an-app-is-api-backend-and-stores.md).

`src/` reads as an app on the kstack Platforms does: `api/` (the Ledger API),
`apis.ts` (Ledger's named APIs), `constants.ts` (the Sync Mode), `model/` (the
words of money), `backend/`, `session/`, `queries/`, `mutations/` and `cache/`. The Backend
(`backend/backend.ts`) is the API's handlers (`backend/handlers/`) on the
services they need: the ledger table (`backend/services/table/`, in D1, in a
User's own Durable Object, or on the device), a Broadcaster that hears each
write (`backend/services/broadcaster/`), and who a token names (auth-toolkit's
`authz.cloud` and `authz.device`). Which versions are given decides where it
runs: web's Worker gives the cloud ones, and `backend/device` gives the device
ones, so `device` runs the device Backend in the page or on the phone.
`session/` is `ledgerSession`, one user's money through Std Sync and TanStack
DB, written with platform-toolkit's `defineSession`. Screens never touch it:
they read money through `queries/` (live queries that update as the money
does) and change it through `mutations/`, so they only show what they are
given.

The Sync Mode (`syncMode` in `constants.ts`, chosen when Ledger is built)
decides how money reaches every device. In `realtime`, the default, the
Ledger API is a WebSocket at `/live` to each User's own Durable Object, and
every collection reads its newest page first and then subscribes to its
`Watch` stream. In `polling` it is HTTP at `/rpc` to the shared D1 database,
and every collection reads newest first and asks for changes every 10
seconds. The device Backend follows the same mode. `cache/` is this device's Settings, which belong to no user. The
Commands (`commands/`) and the Places with what each shows (`places/`) sit
beside them.

Core makes no app. Each app hands `apis`, `device`, `ledgerSession` and
`ledgerCache` to its Platform's `createApp`: the Web Platform's in
`ledger/web/src/app.ts`, the Expo Platform's in `ledger/expo/src/ledger/app.ts`.
Core imports nothing from `react-dom`, `react-native`, `window`, `document` or
`indexedDB`; what differs by platform is the Host each Platform gives. The
TypeScript config has no DOM or Node library, and
`tests/platform-free.test.ts` fails on any platform import or browser global,
so the seam cannot be skipped. Layers and their rules are in
`laymos.config.json`.

## Exports

### `@ledger/core/api`

| Export        | What it does                                                                                                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LedgerApi`   | The RPC group both Backends answer and clients call: for each of Account, Category, Entry and Preferences its `Changes`, `Older`, `Watch` (a stream), `Put` and `Delete` (Preferences has no `Delete`), plus `LedgerSample` and `LedgerClear`. |
| `LedgerError` | Why the Backend refused a call.                                                                                                                                                                                                                |

### `@ledger/core/apis`

| Export | What it does                                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `apis` | Ledger's named APIs: `ledger`, the Ledger API over a WebSocket at `/live` in the realtime Sync Mode, or over HTTP at `/rpc` in the polling one. |

### `@ledger/core/constants`

| Export     | What it does                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| `syncMode` | The Sync Mode Ledger is built in, `realtime` (the default) or `polling`; the app and the Worker both read it. |

### `@ledger/core/model`

| Export                                                                                      | What it does                                                    |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `Account`, `Category`, `Entry`, `Preferences`, `Way`                                        | The Schemas of money every side speaks.                         |
| `defaultPreferences`                                                                        | A User's Preferences before they change any.                    |
| `CURRENCIES`, `centsOf`, `money`, `signed`                                                  | Amounts in cents, and how they read in a currency.              |
| `today`, `dayOf`, `dayName`, `shiftDay`, `monthOf`, `monthName`, `shiftMonth`, `isMonthKey` | Days and Months, by their keys.                                 |
| `balances`, `byDay`, `monthsOf`, `newestFirst`, `summarize`                                 | The sums over Entries: balances, days, Months and their totals. |
| `sample`                                                                                    | The sample Accounts, Categories and Entries for a new User.     |

### `@ledger/core/backend`

| Export          | What it does                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ledgerBackend` | The Backend wherever it runs: the Ledger API's handlers, each call checked for the User who signed it; needs the ledger table, a Broadcaster and a Resolver. |

### `@ledger/core/backend/device`

| Export   | What it does                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `device` | The device Backend for `createApp`: every API's handlers on the device's own table, loaded the first time someone chooses it. |

### `@ledger/core/backend/services/table`

| Export                                             | What it does                                                   |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `ledgerTable`                                      | The one table every User's money is kept in, a partition each. |
| `accounts`, `categories`, `entries`, `preferences` | Each kind of money on that table.                              |

### `@ledger/core/backend/services/table/cloud`

| Export       | What it does                                                          |
| ------------ | --------------------------------------------------------------------- |
| `tableCloud` | The ledger table in the Worker's D1 database, from its `env` binding. |

### `@ledger/core/backend/services/table/durable-object`

| Export               | What it does                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `tableDurableObject` | The ledger table in one User's Durable Object, on its own SQLite storage, set up each time the object wakes. |

### `@ledger/core/backend/services/table/device`

| Export        | What it does                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `tableDevice` | The ledger table on this device, kept in the Host's Storage (database `local-backend`, so what it held before the rename stays). |

### `@ledger/core/backend/services/broadcaster/device`

| Export              | What it does                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `broadcasterDevice` | What hears every write to the ledger table on this device: the Host's Broadcaster for `local-backend`, so on the web every tab. |

### `@ledger/core/backend/services/broadcaster/durable-object`

| Export                     | What it does                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `broadcasterDurableObject` | What hears every write in a User's Durable Object: the object itself, which each of their sockets is connected to. |

### `@ledger/core/session`

| Export          | What it does                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `ledgerSession` | The Session for `createApp`: one signed-in User's money, on the `apis` and `sync` it is given. |
| `useSession`    | The open Session.                                                                              |
| `useUser`       | The User whose Session is open.                                                                |

### `@ledger/core/queries`

| Export          | What it does                                                                           |
| --------------- | -------------------------------------------------------------------------------------- |
| `useAccounts`   | The User's Accounts, in the order money moves through them.                            |
| `useBalances`   | Each Account's balance, summed by a live query as Entries change.                      |
| `useCategories` | The User's Categories, money out first; only one way's if asked.                       |
| `useCurrency`   | The currency the User counts in.                                                       |
| `useLookup`     | The User's Accounts and Categories by id.                                              |
| `useHome`       | Home's Month: what is left, in against out, Budgets fullest first, the latest Entries. |
| `useMonths`     | The Months, newest first, with the most that came in or went out in one.               |
| `useMonth`      | One Month: its summary, its days, and whether it can turn to the Months either side.   |
| `useEntries`    | The Entries a search shows, newest first and by day, and the narrowing in words.       |
| `useEntryAt`    | One Entry among those a search shows, where it stands, and the ones beside it.         |

### `@ledger/core/mutations`

| Export         | What it does                                                                |
| -------------- | --------------------------------------------------------------------------- |
| `useMutations` | Every way a screen changes money, each shown at once and undone if refused. |

### `@ledger/core/cache`

| Export                                           | What it does                                                                 |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `ledgerCache`                                    | The Cache for `createApp`: this device's Settings, in its `device` database. |
| `Settings`                                       | The Schema of this device's Settings.                                        |
| `defaultSettings`                                | The Settings of a device that changed none.                                  |
| `settingsTable`, `settingsEntity`, `SETTINGS_ID` | The table Settings are kept in, and their one row.                           |
| `openSettings`                                   | Opens this device's Settings on a table: live, and changed in place.         |
| `useSettings`                                    | Opened Settings in React, live.                                              |
| `useDeviceSettings`                              | Opened Settings in React, live, with the way to change them.                 |

### `@ledger/core/commands`

| Export                                                        | What it does                                            |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| `keys`, `definition`                                          | Every Command with its keys and Surface, from use-keys. |
| `GESTURES`, `GESTURE_GUIDE`                                   | How each Command is given on a touch screen.            |
| `useCommand`, `announce`, `quietly`, `useGiven`               | Runs a Command and tells the Key Bar and the sounds.    |
| `setCommandSounds`                                            | Plays Commands' sounds the platform's way, or none.     |
| `usePlace`                                                    | Gives Commands to a Place's Surface while it is shown.  |
| `said`                                                        | A gesture in words, as the Gestures Section says it.    |
| `bindingsOf`, `written`, `bindingOf`, `keysOff`, `ACTION_IDS` | The User's own keys, stored and read back.              |

### `@ledger/core/places`

| Export                                       | What it does                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `PLACES`                                     | Every Place in the Place order, with its address and the Command that Goes there.        |
| `SETTINGS_SECTIONS`                          | The Sections of Settings in order, each with its Command.                                |
| `stopsFrom`                                  | What a Thumb Lock picks from where you are, and where it starts; icons named, not drawn. |
| `placeTitle`                                 | What the header calls the Place at an address.                                           |
| `validateEntriesSearch`, `narrowing`         | An Entries address's search, and it without its mark.                                    |
| `markAfterRemoving`                          | Where the mark goes after a delete.                                                      |
| `firstAccount`, `quickDays`, `ACCOUNT_KINDS` | What a new Entry or Account starts from.                                                 |

## Usage

### Run Ledger on a Platform

An app hands core's parts to its Platform's `createApp` once; its screens use
what comes back and core's hooks.

```ts
// ledger/web/src/app.ts
import { createApp } from '@kstackz/web-platform';
import { apis } from '@ledger/core/apis';
import { device } from '@ledger/core/backend/device';
import { ledgerCache, useDeviceSettings } from '@ledger/core/cache';
import { ledgerSession } from '@ledger/core/session';

export const app = createApp({
  name: 'ledger',
  title: 'Ledger',
  apis,
  device,
  cache: ledgerCache,
  auth: { url: AUTH_URL, session: ledgerSession },
});
export const useSettings = () => useDeviceSettings(app.cache());
```

- Nothing runs until a screen first renders `SignedIn` or calls a hook, so the module can load where the Host is not there yet, as on a web server.
- The Expo app does the same with the Expo Platform's `createApp` (`ledger/expo/src/ledger/app.ts`).
- The device Backend's code is loaded the first time someone chooses it: a chunk of its own on the web; on a phone Metro picks `backend/device/load-device.native.ts`, which has it in the bundle.
- Under `SignedIn`, screens read the money with Queries (`@ledger/core/queries`) and change it with `useMutations` (`@ledger/core/mutations`).

### Serve the cloud Backend

The Worker gives the Backend the cloud versions of its services: D1 for the
polling Sync Mode, and a Durable Object per User for the realtime one.

```ts
// ledger/web/src/worker.ts
const auth = { url: AUTH_URL, resource: LEDGER_RESOURCE };

export const LedgerObject = liveObject({
  api: apis.ledger,
  backend: (_env: WorkerEnv, storage) =>
    ledgerBackend.pipe(
      Layer.provide([tableDurableObject(storage), broadcasterDurableObject]),
    ),
  auth,
  streams: (state) => Rpc.websocket.streams.sqlite({ storage: state.storage }),
});

export default createServer({
  apis,
  backend: (env: WorkerEnv) => ({
    ledger: ledgerBackend.pipe(Layer.provide(tableCloud(env.DB))),
  }),
  live: (env: WorkerEnv) => ({ ledger: env.LedgerObject }),
  auth,
}) satisfies ExportedHandler<WorkerEnv>;
```

- `createServer` serves whichever transport `apis.ledger` has: HTTP at `/rpc` through `backend`, or a WebSocket at `/live` handed to the caller's own `LedgerObject` through `live`.
- `LedgerObject` runs the same `ledgerBackend` on the object's own SQLite and keeps open `Watch` streams there while it sleeps. Each call is still checked with auth-toolkit's `authz.cloud`.
- The device Backend is the same `ledgerBackend` on `tableDevice`, `broadcasterDevice` and `authz.device`, run in-process by the app.

### Check

```bash
pnpm --filter @ledger/core test   # the model, the Backend, Settings, sessions, Commands, Places, platform-free
pnpm --filter @ledger/core lint   # tsc without DOM or Node, and laymos lint
```
