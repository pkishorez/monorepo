# Auth

Status: works. Sign in, sign out and the saved session all work; pages are
States, with no URLs.

## What was ported

Foldkit's `auth`: a signed-out site (Home, Login) and a signed-in site
(Dashboard, Settings). Login takes a second and accepts any email with the
password "password". The session is saved to localStorage, so a reload stays
signed in, and Sign out clears it.

```
Auth (root)                          requires AuthServer (from the Layer)
  Checking                           Lifetime: AuthServer.loadSession → CheckedSession
  LoggedOut                          Provides SignIn
  └─ pages: LoggedOutPages           requires AuthServer, SignIn (passing through)
       Home
       Login
       └─ form: LoginForm            Model { email, password }
            Editing { error }
            Submitting               Command: AuthServer.login → SignIn.complete (a Request)
  LoggedIn { session }               Provides SignedIn { session, logOut }
  └─ pages: LoggedInPages            requires SignedIn
       Opening                       Lifetime: reads SignedIn.session → Opened
       Dashboard { session }
       Settings { session }          Sign out → Command → SignedIn.logOut() (a Request)
session/      Session schema, SignIn and SignedIn Capabilities
auth-server/  AuthServer Capability: fake login, session in localStorage
```

Signing in: `SubmittedForm` → `Submitting` and a login Command →
`SignIn.complete(session)` → Auth gets `SucceededLogin` and moves to
`LoggedIn`, which destroys the whole signed-out site (form included) and
creates the signed-in one, and a Command saves the session.

## Page switching as States

This is Foldkit's two-level route union (`LoggedOut { route }` and
`LoggedIn { route, session }`) as two levels of Actors. It fits well:

- A signed-out page can never exist with a session, nor the reverse. The
  types say so: LoginForm Requires SignIn, which only LoggedOut Provides,
  so it cannot compile under LoggedIn.
- Foldkit's guard code (a signed-out user asking for /dashboard is sent to
  /login, and the reverse) is gone: with no URLs there is nothing to guard.
  With routing, it would come back as "which State does this URL give, in
  this State".
- Leaving Login throws the form away. Foldkit keeps `loginModel` in the
  LoggedOut Model, so typed text survives a trip to Home; here it does not.

## Deviations

- **No routes, no NotFound page.** Pages are States, switched by nav
  buttons (blocker 15). The browser's address bar never changes.
- **Flags became a Checking State**, as in todo: the saved session arrives as
  a Message at Time 0, so Replay never reads localStorage.
- `KeyValueStore` from `@effect/platform-browser` is replaced by
  `AuthServer`, a Capability in the app's Layer that owns both the fake login and
  the session storage.
- Validation is a single message under the form (valid email, then password
  required), checked on submit, not Foldkit's per-field validation while
  typing.
- `LogError` is dropped: a failed save or clear is a Message in the Log.

## Blockers

- **Children cannot be given input when they are created** (now possible: a Child's `init` takes its Input; this demo is unchanged) (blocker 3) and
  **a parent cannot pass data to a Child** (blocker 13). Both signed-in pages
  draw the session, which Auth already has in its State. LoggedInPages can
  only get it by starting in `Opening`, whose Lifetime reads the `SignedIn`
  Capability and sends `Opened { session }`: an extra Message per sign-in to copy
  data the parent holds, and an `Opening` State drawn as nothing.
- **No routing** (blocker 15).
- **Each State is drawn by its own component** (blocker 11): the login inputs
  are drawn again when the form goes Editing → Submitting → Editing. They are
  disabled while submitting anyway, so the lost focus is hardly noticed.

## Testing

Foldkit tests the login page with `story`: typing validates each field,
submitting invalid fields asks for nothing (`Command.expectNone()`), valid
fields ask for `SimulateAuthRequest`, which is resolved with success (an
`OutMessage.SucceededLogin`) or failure (the password field turns Invalid).
A scene submits the form, checks `Command.expectExact(SimulateAuthRequest)`,
resolves it, then expects exactly `SaveSession` and `RedirectToDashboard`.

What Effect Oak would need:

- Named Commands (blocker 4) to say "submitting asked for a login with these
  credentials" and "signing in asked for SaveSession".
- A typed `Actor.step` (blocker 5) for LoginForm's and Auth's rules.
- Foldkit's OutMessage is a value Update returns, so a test reads it. Here the
  same fact is a Request inside a Command (`SignIn.complete`). A test can run
  LoginForm under `Runtime.start` with stub `AuthServer` and `SignIn` Layers
  and record what `complete` got, which is an integration test.
- Emitting a Lifetime's Message by hand (blocker 6) for `Checking` and
  `Opening`.
- A scene across the Request: drawing the whole tree from a Model and State
  (blocker 5), then clicking Sign in and answering the login Command.
