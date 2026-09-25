---
'auth-toolkit': patch
'kui-toolkit': patch
---

Several Signed-in Accounts per browser. `createAuthWorker` takes an optional `multiSession: { enabled, maximumAccounts? }` block that, with `enabled` true, turns on Better Auth's multi-session plugin. With it on, every Auth Worker screen shows an account switcher top-right: the Active Account's email, a `+N` badge for the other Signed-in Accounts, and a menu to switch, add another account, sign out of the active one, or sign out of all. The Login Screen accepts `add_account` to let a signed-in User add another account; the Consent and Device screens act as the Active Account and switch in place. With it off every screen is unchanged. kui-toolkit's auth block gains `AccountSwitcher`, an `accounts` prop on each screen, and an `adding` login state; `email-privacy` becomes its own module.
