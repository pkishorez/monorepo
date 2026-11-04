---
'@kestack/auth-toolkit': patch
---

A Browser app can sign in with Google from its own screen, and the Fake comes back where a sign-in asks.

**Added**

- `signIn({ provider: 'google', returnTo })` on `browser()`: asks the Auth Worker where Google is, as its Login Screen's button does, and leaves for it at once, without the Login Screen. The sign-in comes back to `returnTo` (else `browser({ returnTo })`, else the page it left from); one that fails lands on the Login Screen, which says why, adding an Account when one was signed in already. The Auth Worker needs no change: it trusts every origin under its `cookieDomain`.
- `browser({ maxAccounts })`, 5 unless given: a `provider` sign-in with that many Accounts signed in fails `AccountLimitReached`, as the Login Screen refuses one.
- `fakeAccounts({ returnTo })`, and the Fake `browser({ returnTo })`: once someone is chosen, a sign-in whose `returnTo` (its own, else this one) is another page leaves for it with `window.location.assign`, as the real one would; on the same page it signs in in place, as before. A Test User (`test`) always signs in in place. The Fake asks who for a `provider` sign-in as for any other.
