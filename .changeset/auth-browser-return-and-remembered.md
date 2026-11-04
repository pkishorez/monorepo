---
'@kestack/auth-toolkit': patch
---

A Browser app can say where a sign-in comes back to, and read the Accounts its cache remembers.

**Added**

- `browser({ returnTo })`: where a sign-in that names no `returnTo` comes back to, as an absolute URL. Unless given, it is the page the sign-in left from, as before. An app whose pages are each one Account's can send an Account added from its Account Switcher to a page that is not the old Account's.
- `rememberedAccounts`, from `client/browser`: the Accounts the `cache` remembers as last signed in, without tokens, in sign-in order; none when it remembers none or cannot be read. Provide it the same Layer of `browserAccountsTable` given as `cache`.
