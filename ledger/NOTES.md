# Ledger on Expo: build notes

Running log of the Ledger on Expo build (spec: `.claude/specs/ledger-on-expo.md`).
Each step adds a section: challenges, hacks, drawbacks, open questions,
cleanup still owed, and improvements.

## For the morning: read first

- **Two conflicting sign-in ADRs.** Another session working in this same
  worktree committed `apps/kstack/docs/adr/0009-native-ledger-signs-in-as-an-oauth-client.md`
  (9eb9f68a: native Ledger as an OAuth client with PKCE), which you approved
  there; here you approved Device Login (`toolkits/auth-toolkit/docs/adr/0017`).
  Device Login is what was built. Pick one: if Device Login stands, revert
  9eb9f68a's ADR (it also collides with ADR number 0009). Its duplicate
  Gesture Haptics glossary entry was merged into the one approved here.
