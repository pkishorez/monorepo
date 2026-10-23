# 21. An Account Switch under way is state

Date: 2026-10-20

## Status

Accepted.

## Context

An Account Switch is never instant. `Accounts.switchTo(userId)` asks the Auth Worker, whose cookie decides who is active, then commits what it answers. Until then `Accounts` said nothing, so each app kept its own flag for a switch it had asked, and each showed it differently or not at all. The kabuki-start APIs page showed nothing until the switch landed. The Auth Worker's own pages showed a spinner, then reloaded their data anew, so the page blanked into skeletons after the spinner: two loads where the User made one choice.

## Decision

`AccountsState.SignedIn` carries `switchingTo?: Account`, the Account a switch under way makes active. It is optional, so every match on `SignedIn` keeps working.

- It shows as soon as `switchTo` is called, before the switch waits its turn behind other changes. `active` stays the Account before, and every call acts as it, until the Auth Worker confirms.
- Confirmed, the state is `SignedIn` with the new Active Account and no `switchingTo`.
- Failed or stopped, the state goes back to what it was, without `switchingTo`, and `switchTo` fails with its error.
- Of switches asked one after another, the newest is shown until the last is answered. They still run one at a time, as every change does.
- A peer's Snapshot (another tab's) that arrives during a switch may be older than the switch's answer or newer. Once the switch is done, `Accounts` checks again instead of trusting it.
- It is `makeAccounts`' alone, so `browser()` in both modes and `device()` all behave the same. `Checking` and `SignedOut` have no `switchingTo`.

How long a switch must be under way before it shows is not `Accounts`' to decide. Each page times it as Kabuki's Router times a move: it shows after 150 ms, and once shown it stays at least 300 ms. The timers are Workers on the page, so they show on the Timeline. The Auth Worker's pages keep what they show until the new Account's data is ready, then swap it in one step. They do this with Kabuki's `Router.reload({ anew: true, hold: true })`, added for this. A plain reload anew lets go of the data after the Router's delay.

## Consequences

An app shows a switch from the state it already follows, without a flag of its own. A View that matches `SignedIn` and ignores `switchingTo` behaves as before. A test that collects every state sees one more `SignedIn`, with `switchingTo`, during each switch to another Account. A peer's change during a switch costs one more read.
