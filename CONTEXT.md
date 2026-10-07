# Monorepo

Published packages for building full-stack Effect apps under the kstack umbrella, designed to work together.

## Language

**kstack**:
The umbrella name for the packages in this repo that make up one stack, published under the `@kstackz` npm scope.
_Avoid_: brand, kstackz (as a name), pkishorez packages

**Toolkit**:
A kstack package covering one area of an app (data, AI, RPC, auth) or one platform (web, Expo), named `@kstackz/<area>-toolkit`.
_Avoid_: kai-toolkit, kui-toolkit, unscoped toolkit names

**Expo Toolkit**:
The one Toolkit for native apps built with Expo, `@kstackz/expo-toolkit`: their UI, gestures, haptics and sound, and the phone as an app's Platform. What only differs in where data is kept or how a User signs in stays in the Toolkit for that area, as one more target of it.
_Avoid_: expo-ui-toolkit, native toolkit, mobile toolkit

**Web Toolkit**:
The one Toolkit for web apps, `@kstackz/web-toolkit`: their UI, input, forms, Recipes, the optional PWA, and the opinionated client and server setup. It connects the area Toolkits for the web (sign-in, the Backend, data) without containing or re-exporting them.
_Avoid_: ui-toolkit, pwa-toolkit (the two packages it replaces), frontend toolkit

**Recipe**:
One whole interaction a platform Toolkit ships ready to use, such as the Sidebar, the Thumb Picker or Local Sign-In. A Recipe in the Web Toolkit and one in the Expo Toolkit with the same name are the same interaction on two platforms.
_Avoid_: pattern, block, widget

**Backend**:
What answers an app's API: one Layer of handlers that does not know where it runs. Given the cloud versions of its Services it is the **cloud Backend**, on a Cloudflare Worker; given the device versions it is the **device Backend**, in the app itself. The two were formerly the Remote Backend and the Local Backend.
_Avoid_: Remote Backend, Local Backend, server

**Service**:
One thing a Backend needs, such as a table or who a token names, with a `cloud` and a `device` version, each imported from the Service's own module.
_Avoid_: adapter, edge

**Backend Link**:
What an app's client keeps for as long as it runs on one Backend: how its sessions call the Backend's API, and the platform their Std Sync runs on. Made when the Backend starts and ended with it.
_Avoid_: backend store, connection

**Session**:
What an app's client keeps for one signed-in user: an RPC runtime signed as them and a Std Sync named for them, with its collections. Made when they become active and ended when they stop being active.
_Avoid_: session store, user store

**Cache**:
What only this device has and belongs to no user, such as an app's Settings.
_Avoid_: a user's Std Sync (that is the user's data, which lives on the Backend)

**Platform**:
Everything an app needs of where it runs: where tables are kept, the platform Std Sync runs on, cloud sign-in, and the device's memory, network and other tabs. The Web Toolkit's `webPlatform` and the Expo Toolkit's `expoPlatform` each give one; an app never defines its own.
_Avoid_: LedgerPlatform, environment

**Stand-alone tool**:
A package from this repo that is useful without kstack and keeps its own unscoped name, such as `laymos` or `use-effect-ts`.

**Re-export package**:
A package that depends on every Toolkit and only re-exports them. Considered and rejected for kstack.
_Avoid_: umbrella package, meta-package
