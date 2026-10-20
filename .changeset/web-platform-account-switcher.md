---
'@kestack/web-platform': patch
---

New `@kestack/web-platform/account-switcher` for Kabuki apps. It has three parts. `AccountSwitcherLive` is a Child of the root page that follows auth-toolkit's `Accounts`. It shows an Account Switch once it has been under way 150 ms, then for at least 300 ms, and runs switch, add and sign-out one at a time. `AccountSwitcherView` is the header slot that the root page draws: "Sign in" when signed out, the Auth Worker's Account menu when signed in, and the remembered avatar while checking. It is the same width in every state, so nothing beside it moves. `CurrentAccount` is the Capability the root page Provides with `CurrentAccount.layer`. Pages read who is signed in and the switch on screen from it, and ask it to sign in, switch and sign out. `recipes/account-switcher` is removed: nothing used it.
