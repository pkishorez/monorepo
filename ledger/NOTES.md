# Ledger on Expo: build notes

Running log of the Ledger on Expo build (spec: `.claude/specs/ledger-on-expo.md`).
Each step adds a section: challenges, hacks, drawbacks, open questions,
cleanup still owed, and improvements.

## For the morning: read first

- **Two conflicting sign-in ADRs.** While this was being planned, another
  session left an uncommitted `apps/kstack/docs/adr/0009-native-ledger-signs-in-as-an-oauth-client.md`
  (native Ledger as an OAuth client with PKCE) and a second **Gesture Haptics**
  entry in `apps/kstack/CONTEXT.md`. The decision you approved in this
  conversation is Device Login (`toolkits/auth-toolkit/docs/adr/0017`), so that
  is what was built. The other session's files are left untouched and
  uncommitted; delete them or tell me to switch.
