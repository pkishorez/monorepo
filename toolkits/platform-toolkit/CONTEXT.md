# Platform Toolkit

Running an app on any platform: its named APIs on a cloud or a device Backend, several Accounts signed in on one device with one Session each, and its cache. The Web and Expo Platforms are built on it.

## Language

### The app

**Host**:
Everything the Platform Toolkit needs of where an app runs, as a Platform gives it: its Storage, its cloud address and Sign-in, its lifecycle (online, foreground, launch), and its other tabs if it has any. An app never meets it.
_Avoid_: Platform (the package kind), environment, AppPlatform

**API**:
One of an app's named ways to call a Backend: a group and the Transport it is reached by, such as `ledger: Api.http(LedgerApi, { path: '/rpc' })`. A path is resolved against the cloud address; a full URL is left alone. Every API is signed by the one auth; which calls need it is the Guard's business.
_Avoid_: endpoint, service, client, Api (the former single group)

**Backend**:
What answers an app's APIs: the cloud Backend or the device Backend. Each has its own Accounts; changing Backend signs no one out of either. The same handlers run on both; only the Services they are given differ.
_Avoid_: server, environment, mode

**Cloud Backend**:
The Backend run on a server, where Users sign in through the sign-in service and their data is kept for every device. Formerly the Remote Backend; a stored or launched `remote` is read as `cloud`.
_Avoid_: Remote Backend, real backend, production

**Device Backend**:
The Backend run in the app itself, every API's handlers in this process, where Users sign in as Named Accounts and their data never leaves the device. An app has it for every API or not at all. Formerly the Local Backend; a stored or launched `local` is read as `device`.
_Avoid_: Local Backend, demo, mock backend, offline mode

**Public Call**:
A call to an API outside any Session, signed as nobody: it goes out if the call is not guarded, and fails Unauthenticated without being sent if it is.
_Avoid_: anonymous request, unsigned API

**Cache**:
What only this device has and belongs to no user, such as an app's Settings. Neither the Backend nor a User's Sync holds it.
_Avoid_: local storage, preferences store

### Accounts

**Gate**:
What runs an app's sign-in on one device: which Backend it is on, which Accounts there are, and which is the Active Account, whose Session it keeps open. Every screen asks it whether someone is signed in; nothing starts until one first asks. Only an app with auth has one.
_Avoid_: auth gate (it is more than a check), app machine, session manager

**Open First**:
The Gate's rule for an account it already knows: on an Account Switch, or at launch with an Active Account remembered, its Session opens at once from what the device keeps, and the Backend confirms it afterwards. Only a device that knows nobody waits for the Backend.
_Avoid_: optimistic switch, eager open, cached login

**Remembered Accounts**:
The Accounts on one Backend as of the Gate's last check, kept by the device, with no tokens, so the Gate can show them and Open First before the Backend answers. Every answer from the Backend replaces them whole; they never hold an account the Backend did not name.
_Avoid_: account cache (Cache is what belongs to no user), multi-session, device sessions

**Account Lost**:
The Gate finding that the Active Account is no longer signed in, because it expired or was signed out on another device or app. The User must sign in to it again, keeping its User's Sync, or switch to another account, deleting it. Signing out on this device is never an Account Lost.
_Avoid_: kicked out, session expired, forced logout

**Gate Notice**:
A message the Gate leaves for the app once, such as a sign-in that came back without signing anyone in. An Account Lost is not one: it holds the app until the User acts.
_Avoid_: event, alert, login error (one kind of Gate Notice)

### Sessions

**Session**:
What an app keeps for one Account while it is active, written once with `defineSession` as a function of the Session Context. Opened when the Account becomes active and closed on an Account Switch, a sign-out or a change of Backend; closing interrupts every call still in flight, so nothing of one Account reaches another's screen.
_Avoid_: session store, user store, Backend Link, better-auth's session (that is a Sign-in)

**Session Context**:
What the Platform Toolkit gives a Session to be built from: every API signed as the Account, the User's Sync, the Account, and the Session Status. Typed by the app's APIs.
_Avoid_: session input, session deps

**Session Status**:
Whether the open Account has been confirmed by its Sign-in since the Session opened: verifying or verified, with when it was last verified. A call made while verifying waits for the token; nothing fails for being early.
_Avoid_: auth state, loading

**Session Closed**:
What a run in a Session rejects with when the Session closed first. Retrying and timing out a call are the caller's business, never the Session's.
_Avoid_: cancelled, aborted

**User's Sync**:
The Std Sync of one user's data on the device, so it opens at once and offline, named for the user by `syncName`. On the cloud Backend it is deleted once the user is no longer signed in.
_Avoid_: copy, cache (Cache is what only the device has), replica
