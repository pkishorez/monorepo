# 15. First-Party apps may add and sign out one Signed-in Account

Date: 2026-10-05

## Status

Accepted. Amends [ADR 0014](./0014-first-party-apps-may-switch-and-act-as-an-account.md) and [ADR 0012](./0012-account-switch-is-browser-wide.md).

## Context

ADR 0014 left adding and signing out accounts on the Auth Worker's pages. kstack's Ledger sent its users to a new tab for the two things they came to its User Switcher for, which they found worse than doing it in place (kstack ADR 0004).

## Decision

A First-Party app adds an account with the client's `signIn.google()` while signed in: the multi-session plugin keeps the earlier accounts and makes the new one active. The browser client gains `signOutAccount(token)`, which signs out one Signed-in Account through `multiSession.revoke`, active or not. `signOut()` still removes every one.

## Consequences

The client does not know the account cap (`multiSession.maximumAccounts`): at the cap a new sign-in becomes the Active Account but is not listed among the Signed-in Accounts. An app cannot warn before Add yet; exposing the cap in the Auth Worker Contract is left to the Auth Worker flow redesign.
