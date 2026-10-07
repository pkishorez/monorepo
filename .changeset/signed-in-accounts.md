---
'@kstackz/auth-toolkit': patch
'@kstackz/web-toolkit': patch
---

Several Signed-in Accounts per browser. The Auth Worker always runs Better Auth's multi-session plugin; `createAuthWorker` takes an optional `multiSession: { maximumAccounts? }` block to change the cap (default 5). Every Auth Worker screen shows an account switcher top-right: the Active Account's email, a `+N` badge for the other Signed-in Accounts, and a menu to switch, add another account, sign out of the active one, or sign out of all. The Login Screen accepts `add_account` to let a signed-in User add another account; the Consent and Device screens act as the Active Account and switch in place. The Device Screen no longer looks up a prefilled code on load; the User confirms the account and presses Continue. A consumer app's `signOut()` signs out every Signed-in Account. ui-toolkit's auth block gains `AccountSwitcher`, an `accounts` prop on each screen, and an `adding` login state; `email-privacy` becomes its own module.
