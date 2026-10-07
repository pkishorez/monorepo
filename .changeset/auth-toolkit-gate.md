---
'@kstackz/auth-toolkit': patch
'@kstackz/std-toolkit': patch
'@kstackz/use-gesture': patch
'@kstackz/expo-toolkit': patch
---

auth-toolkit adds the Gate (`./gate`, with `./gate/react`): sign-in on one device for any app on any platform. It keeps the app on the cloud or the device Backend (`?backend=` and stored choices still read the former `remote` and `local`), holds a Backend Lifetime and the Active Account's Session Lifetime, remembers the Signed-in Accounts in a table of its own (`gateTable`, kept by the platform's `table`) so every one shows and the active one opens before the Backend answers, follows an Account Switch made in another tab or app, stops at an Account Lost (the `accountLost` view, until the User signs in to that account again or opens another, which deletes its copy), and tells the device's other tabs what changed. Calls made before the Backend has confirmed the account wait for its token instead of failing. React gets `SignedIn`, `SignedOut`, `useGate` (anywhere), and `useAccounts` and `useSession` (inside `SignedIn`); `Authz.bearer` also takes the token as an Effect to wait on. `./app` builds an app on it: `createApp({ platform, cloud, device, session })` opens the app's backend store per Backend and its session store per signed-in user, signs users in to the device Backend itself, and deletes a signed-out user's copy (`copyName`). You need it so each app does not rebuild multi-account sign-in, and so an Account Switch never mixes one User's calls with another's.

std-toolkit: disposing a Std Sync first gives writes on their way to the Backend up to five seconds (`drain`) to land; `inOrder()` from `./sync` sends each key's writes to the Backend in the order they were made; `./db/sqlite/d1` exports the `D1Statement` type.

use-gesture: the web bindings moved to `@kstackz/web-toolkit/input`; this package is the platform-free core.

expo-toolkit: `./patterns/*` is now `./recipes/*`, and `./platform`'s `expoPlatform` gives `createApp` the phone as its platform: expo-sqlite tables and Std Sync, and `authExpo`; it no longer depends on `expo-secure-store`. The `AccountLost` recipe is the dialog for the Gate's `accountLost` view, as web-toolkit's is on the web.
