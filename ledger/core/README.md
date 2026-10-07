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
`apis.ts` (Ledger's named APIs: `ledger`, over HTTP at `/rpc`), `model/` (the
words of money), `backend/`, `session/` and `cache/`. The Backend
(`backend/backend.ts`) is the API's handlers (`backend/handlers/`) on the
services they need, the ledger table (with a `cloud` and a `device` version
in `backend/services/table/`) and who a token names (auth-toolkit's
`authz.cloud` and `authz.device`). Which versions are given decides where it
runs: web's Worker gives the cloud ones, and `backend/device` gives the device
ones, so `device` runs the device Backend in the page or on the phone.
`session/` is `ledgerSession`, one user's money through Std Sync and TanStack
DB, written with platform-toolkit's `defineSession`, and the hooks screens
read it with. `cache/` is this device's Settings, which belong to no user. The
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

| Export        | What it does                                         |
| ------------- | ---------------------------------------------------- |
| `LedgerApi`   | The RPC group both Backends answer and clients call. |
| `LedgerError` | Why the Backend refused a call.                      |

### `@ledger/core/apis`

| Export | What it does                                                       |
| ------ | ------------------------------------------------------------------ |
| `apis` | Ledger's named APIs: `ledger`, the Ledger API over HTTP at `/rpc`. |

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

| Export          | What it does                                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `ledgerBackend` | The Backend wherever it runs: the Ledger API's handlers, each call checked for the User who signed it; needs the ledger table and a Resolver. |

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

### `@ledger/core/backend/services/table/device`

| Export        | What it does                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `tableDevice` | The ledger table on this device, kept in the Host's Storage (database `local-backend`, so what it held before the rename stays). |

### `@ledger/core/session`

| Export          | What it does                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `ledgerSession` | The Session for `createApp`: one signed-in User's money, on the `apis` and `sync` it is given. |
| `useSession`    | The open Session.                                                                              |
| `useUser`       | The User whose Session is open.                                                                |
| `useMoney`      | Every Account, Category and Entry of the open User, live.                                      |
| `useWrites`     | The writes a User makes, each shown at once.                                                   |

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

| Export                                                        | What it does                                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `PLACES`                                                      | Every Place in the Place order, with its address and the Command that Goes there.        |
| `SETTINGS_SECTIONS`                                           | The Sections of Settings in order, each with its Command.                                |
| `stopsFrom`                                                   | What a Thumb Lock picks from where you are, and where it starts; icons named, not drawn. |
| `placeTitle`                                                  | What the header calls the Place at an address.                                           |
| `glance`                                                      | Home's Month: what is left, in against out, Budgets fullest first, latest.               |
| `monthsView`, `monthView`                                     | The Months with the biggest of any; one Month, its days and its turns.                   |
| `validateEntriesSearch`, `shownBy`, `narrowedTo`, `narrowing` | Which Entries an Entries search shows, and the narrowing in words.                       |
| `entryAt`, `markAfterRemoving`                                | An open Entry's place and neighbours; where the mark goes after a delete.                |
| `firstAccount`, `quickDays`, `ACCOUNT_KINDS`                  | What a new Entry or Account starts from.                                                 |
| `useLookup`                                                   | The User's Accounts and Categories by id.                                                |

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
- Under `SignedIn`, screens read the money with `useMoney` and write it with `useWrites`, from `@ledger/core/session`.

### Serve the cloud Backend

The Worker gives the Backend the cloud versions of its services.

```ts
// ledger/web/src/worker.ts
export default createServer({
  apis,
  backend: (env: WorkerEnv) => ({
    ledger: ledgerBackend.pipe(Layer.provide(tableCloud(env.DB))),
  }),
  auth: { url: AUTH_URL, resource: LEDGER_RESOURCE },
}) satisfies ExportedHandler<WorkerEnv>;
```

- The Web Platform's `createServer` gives each call auth-toolkit's `authz.cloud`. The device Backend is the same `ledgerBackend` on `tableDevice` and `authz.device`, run in-process by the app.

### Check

```bash
pnpm --filter @ledger/core test   # the model, the Backend, Settings, sessions, Commands, Places, platform-free
pnpm --filter @ledger/core lint   # tsc without DOM or Node, and laymos lint
```
