# 14. First-Party apps may switch, and act as any Signed-in Account

Date: 2026-10-05

## Status

Accepted. Amends [ADR 0012](./0012-account-switch-is-browser-wide.md). Amended by [ADR 0015](./0015-first-party-apps-may-add-and-sign-out-an-account.md).

## Context

ADR 0012 kept the Account Switch on the Auth Worker's pages and let every First-Party web app see only the Active Account, because letting a Consumer Backend pick its own account seemed to need a new credential shape. It does not: the Auth Worker already runs Better Auth's `bearer` plugin, `list-device-sessions` already returns each Signed-in Account's Session token, and Server-Side Verification already forwards an `authorization` header instead of the cookie. A First-Party app that keeps a local copy per User (kstack's Ledger) cannot rely on the cookie alone: a switch in another tab changes the User under its background sync, and one User's data lands in another's copy.

## Decision

The browser client gains `signedInAccounts()`, every Signed-in Account with its Session token and the Active Account marked, and `switchAccount(token)`, which makes one the Active Account for the whole browser as the Auth Worker's switcher does. An app may send a Signed-in Account's token as `Authorization: Bearer` on its own Consumer Backend's requests, so it acts as that account whichever is active. Adding and signing out accounts stays on the Auth Worker's pages.

## Consequences

The `server` subpaths, the schema and the Auth Worker are untouched; a test in `multi-session.test.ts` pins that a listed token resolves its own account while another is active. Session tokens become readable by First-Party JavaScript, as they already were on the Auth Worker's own pages. An app that acts as a non-active account must re-list on focus: a token stops working once its account is signed out elsewhere.
