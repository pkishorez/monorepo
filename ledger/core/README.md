# @ledger/core

Everything Ledger's web and Expo apps share: the words of money, the Backend's domain and the Local Backend, the client's domain, state, Backends and Gate, and the Commands. Platform-free; each app hands it one platform Layer.

## Big picture

Ledger runs in a browser ([`@ledger/web`](../web)) and natively on a phone
(`@ledger/expo`). Everything below their screens lives here once, so the two
apps cannot drift: the same Backends, Users, Settings, app machine and
Commands. The words are in [`../CONTEXT.md`](../CONTEXT.md), the decisions in
[`../docs/adr/`](../docs/adr/); the split itself is ADR 0010.

Core imports nothing from `react-dom`, `react-native`, `window`, `document` or
`indexedDB`. What differs by platform is one Effect service,
`LedgerPlatform` (`src/client/platform`): where tables and copies are kept,
how a User signs in to the Remote Backend and where it is, the last User, and
when the app is online or in view. Each app provides it as one Layer and hands
it to `createLedger`, which gives the screens everything else. The
TypeScript config has no DOM or Node library, and
`tests/platform-free.test.ts` fails on any platform import or browser global,
so the seam cannot be skipped.

`src/` reads top-down as in `laymos.config.json`: the Gate over each
Backend's client half, built from the platform and the client's state and
domain; the Local Backend's server half over the Backend's domain; the words
of money at the bottom; and the Commands on their own. The Remote Backend's
server half is not here: web hosts it, and the Expo app points at it.

## Exports

### `@ledger/core/shared/ledger`

| Export                                                                          | What it does                                                    |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `Account`, `Category`, `Entry`, `Preferences`, `Way`                            | The Schemas of money every side speaks.                         |
| `defaultPreferences`                                                            | A User's Preferences before they change any.                    |
| `CURRENCIES`, `centsOf`, `money`, `signed`                                      | Amounts in cents, and how they read in a currency.              |
| `today`, `dayOf`, `dayName`, `monthOf`, `monthName`, `shiftMonth`, `isMonthKey` | Days and Months, by their keys.                                 |
| `balances`, `byDay`, `monthsOf`, `newestFirst`, `summarize`                     | The sums over Entries: balances, days, Months and their totals. |
| `sample`                                                                        | The sample Accounts, Categories and Entries for a new User.     |

### `@ledger/core/shared/ledger-api`

| Export        | What it does                                         |
| ------------- | ---------------------------------------------------- |
| `LedgerApi`   | The RPC group both Backends answer and clients call. |
| `LedgerError` | Why the Backend refused a call.                      |

### `@ledger/core/server/storage`

| Export                                             | What it does                                                   |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `ledgerTable`                                      | The one table every User's money is kept in, a partition each. |
| `accounts`, `categories`, `entries`, `preferences` | Each kind of money on that table.                              |

### `@ledger/core/server/backend`

| Export          | What it does                                                     |
| --------------- | ---------------------------------------------------------------- |
| `ledgerBackend` | The Ledger API's handlers, given a table adapter and a Resolver. |

### `@ledger/core/client/platform`

| Export           | What it does                                                   |
| ---------------- | -------------------------------------------------------------- |
| `LedgerPlatform` | The service each app provides, as one Layer, for what differs. |

### `@ledger/core/client/settings`

| Export                                           | What it does                                       |
| ------------------------------------------------ | -------------------------------------------------- |
| `Backend`                                        | The Schema of the two Backends, Remote and Local.  |
| `Settings`                                       | The Schema of this device's Settings.              |
| `defaultSettings`                                | The Settings of a device that changed none.        |
| `settingsTable`, `settingsEntity`, `SETTINGS_ID` | The table Settings are kept in, and their one row. |

### `@ledger/core/client/session`

| Export            | What it does                                              |
| ----------------- | --------------------------------------------------------- |
| `SessionProvider` | Gives the open Session to everything inside it.           |
| `useSession`      | The open Session.                                         |
| `useUser`         | The User whose Session is open.                           |
| `useMoney`        | Every Account, Category and Entry of the open User, live. |
| `useWrites`       | The writes a User makes, each shown at once.              |

### `@ledger/core/client/gate`

| Export         | What it does                                                                   |
| -------------- | ------------------------------------------------------------------------------ |
| `createLedger` | Ledger's client on one platform Layer: its state, Users, Backend and Settings. |

### `@ledger/core/client/commands`

| Export                                                        | What it does                                            |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| `keys`, `definition`                                          | Every Command with its keys and Surface, from use-keys. |
| `GESTURES`, `GESTURE_GUIDE`                                   | How each Command is given on a touch screen.            |
| `useCommand`, `announce`, `quietly`, `useGiven`               | Runs a Command and tells the Key Bar and the sounds.    |
| `setCommandSounds`                                            | Plays Commands' sounds the platform's way, or none.     |
| `bindingsOf`, `written`, `bindingOf`, `keysOff`, `ACTION_IDS` | The User's own keys, stored and read back.              |

## Usage

### Run Ledger on a platform

An app provides `LedgerPlatform` as one Layer and makes its client once; its
screens use what comes back.

```ts
// ledger/web/src/client/app/app.ts
import { createLedger } from '@ledger/core/client/gate';
import { webPlatform } from '../platform/index.ts';

export const { useApp, useSettings, addUser, switchUser, signOut } =
  createLedger(webPlatform);
```

- Nothing runs until a screen first calls `useApp`, so the module can load
  where the platform is not there yet, as on a web server.
- `webPlatform` (`ledger/web/src/client/platform`) is the reference: IndexedDB,
  `localStorage`, the Auth Worker's cookies and window events.

### Check

```bash
pnpm --filter @ledger/core test   # domain, the app machine, the Ledger API, platform-free
pnpm --filter @ledger/core lint   # tsc without DOM or Node, and laymos lint
```
