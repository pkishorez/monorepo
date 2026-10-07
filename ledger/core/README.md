# @ledger/core

Everything Ledger's web and Expo apps share: the API, the model, the Backend (handlers on services, each with a cloud and a device version), and the app: its device Backend, each user's Session, its cache, Commands and Places. Platform-free; each app hands it its own Platform.

## Big picture

Ledger runs in a browser ([`@ledger/web`](../web)) and natively on a phone
([`@ledger/expo`](../expo)). Everything below their screens lives here once,
so the two apps cannot drift: the same Backend, Users, Settings and Commands.
The words are in [`../CONTEXT.md`](../CONTEXT.md), the decisions in
[`../docs/adr/`](../docs/adr/); the split into core, web and Expo is ADR 0010,
and the layout below is the root
[ADR 0004](../../docs/adr/0004-an-app-is-api-backend-and-stores.md).

`src/` reads as an app on the kstack toolkits does: `api/` (the Ledger API),
`model/` (the words of money), `backend/` and `app/`. The Backend
(`backend/backend.ts`) is the API's handlers (`backend/handlers/`) on the
services they need, the ledger table (with a `cloud` and a `device`
version in `backend/services/table/`) and who a token names (auth-toolkit's
`authz.cloud` and `authz.device`). Which versions
are given decides where it runs: web's Worker gives the cloud ones, and the
app gives itself the device ones to run the device Backend in the page or on
the phone. `app/` is what the screens use: `app/ledger.ts` hands
auth-toolkit's `createApp` the Ledger API, the device Backend (`app/device`:
the Backend on the device's own table, loaded only by those who choose it)
and the Session (`app/session`: one user's money through Std Sync and
TanStack DB, per signed-in user), and opens the cache (`app/cache/settings`: this device's
Settings, which belong to no user). The Commands (`app/commands`) and the
Places with what each shows (`app/places`) sit beside them.

Core imports nothing from `react-dom`, `react-native`, `window`, `document` or
`indexedDB`. What differs by platform is one auth-toolkit `Platform`, which
each app builds for now (`ledger/web/src/platform.ts`,
`ledger/expo/src/ledger/platform.ts`) and hands to `createLedger`. The TypeScript config has no DOM
or Node library, and `tests/platform-free.test.ts` fails on any platform
import or browser global, so the seam cannot be skipped. Layers and their
rules are in `laymos.config.json`.

## Exports

### `@ledger/core/api`

| Export        | What it does                                         |
| ------------- | ---------------------------------------------------- |
| `LedgerApi`   | The RPC group both Backends answer and clients call. |
| `LedgerError` | Why the Backend refused a call.                      |

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

| Export        | What it does                                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `tableDevice` | The ledger table on this device, kept where the `Platform` keeps tables (database `local-backend`, so what it held before the rename stays). |

### `@ledger/core/app`

| Export         | What it does                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createLedger` | Ledger on one Platform: auth-toolkit's `createApp` with the Ledger API, its device Backend and Session, plus `useSettings` for this device's Settings. |

### `@ledger/core/app/session`

| Export            | What it does                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `ledgerSession`   | The Session for `createApp`: one signed-in User's money, on the `rpc` and `sync` it hands it. |
| `SessionProvider` | Gives the open Session to everything inside it.                                               |
| `useSession`      | The open Session.                                                                             |
| `useUser`         | The User whose Session is open.                                                               |
| `useMoney`        | Every Account, Category and Entry of the open User, live.                                     |
| `useWrites`       | The writes a User makes, each shown at once.                                                  |

### `@ledger/core/app/settings`

| Export                                           | What it does                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| `Settings`                                       | The Schema of this device's Settings.                                |
| `defaultSettings`                                | The Settings of a device that changed none.                          |
| `settingsTable`, `settingsEntity`, `SETTINGS_ID` | The table Settings are kept in, and their one row.                   |
| `openSettings`                                   | Opens this device's Settings on a table: live, and changed in place. |
| `useSettings`                                    | This device's Settings in React, live.                               |

### `@ledger/core/app/commands`

| Export                                                        | What it does                                            |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| `keys`, `definition`                                          | Every Command with its keys and Surface, from use-keys. |
| `GESTURES`, `GESTURE_GUIDE`                                   | How each Command is given on a touch screen.            |
| `useCommand`, `announce`, `quietly`, `useGiven`               | Runs a Command and tells the Key Bar and the sounds.    |
| `setCommandSounds`                                            | Plays Commands' sounds the platform's way, or none.     |
| `usePlace`                                                    | Gives Commands to a Place's Surface while it is shown.  |
| `said`                                                        | A gesture in words, as the Gestures Section says it.    |
| `bindingsOf`, `written`, `bindingOf`, `keysOff`, `ACTION_IDS` | The User's own keys, stored and read back.              |

### `@ledger/core/app/places`

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

### Run Ledger on a platform

An app makes Ledger once on its platform; its screens use what comes back.

```ts
// ledger/web/src/app.ts
import { createLedger } from '@ledger/core/app';
import { webPlatform } from './platform.ts';
import { AUTH_URL } from './stage.ts';

export const { SignedIn, useAccounts, useGate, useSession, useSettings } =
  createLedger(() => webPlatform({ name: 'ledger', authUrl: AUTH_URL }));
```

- Nothing runs until a screen first renders `SignedIn` or calls a hook, and
  the platform is passed as a function, so the module can load where the
  platform is not there yet, as on a web server.
- The Expo app does the same with its own `expoPlatform`
  (`ledger/expo/src/ledger/platform.ts`).
- The device Backend's code is loaded the first time someone chooses it: a
  chunk of its own on the web; on a phone Metro picks
  `app/device/load-device.native.ts`, which has it in the bundle.

### Serve the cloud Backend

The Worker gives the Backend the cloud versions of its services.

```ts
// ledger/web/src/worker.ts
Rpc.http.server(
  LedgerApi,
  ledgerBackend.pipe(
    Layer.provide([
      tableCloud(env.DB),
      authz.cloud({ authWorkerUrl: AUTH_URL, resource: LEDGER_RESOURCE }),
    ]),
  ),
  { wrap: authz.cookies },
)(request);
```

- The device Backend is the same `ledgerBackend` on `tableDevice` and
  auth-toolkit's `authz.device`, run in-process by `createApp`.

### Check

```bash
pnpm --filter @ledger/core test   # the model, the Backend, Settings, sessions, Commands, Places, platform-free
pnpm --filter @ledger/core lint   # tsc without DOM or Node, and laymos lint
```
