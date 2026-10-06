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
- **An untracked `plan.md` at the repo root** (also from the other session) is
  a brief for a fresh session to rebuild this with OAuth + PKCE and revert the
  Device Login work. It was left untouched. Don't start a session on it unless
  you choose OAuth + PKCE.

## Step 1: workspace

`ledger/*` is a workspace glob, and the default catalog holds the Expo SDK 57
set: expo 57.0.26, react-native 0.86.3, React and react-dom 19.2.3 (down from
19.2.8). The lockfile has one `react` and one `react-dom`. Syncpack lint,
kstack test and lint, and every toolkit test pass, the same as before the
change.

**Challenges**

- Expo published 57.0.27 on 2026-10-06, and the `sdk-57` branch's
  `bundledNativeModules.json` already names that release's modules. Four of
  them (expo-router 57.0.25, expo-sqlite 57.0.4, expo-constants 57.0.21,
  expo-linking 57.0.12) were under the 24-hour `minimumReleaseAge` hold. So
  the catalog follows expo@57.0.26's own `bundledNativeModules.json` instead,
  where every entry is past the hold. No exclusion was added.
- `pnpm install` only installs what a package uses, and nothing uses the
  Expo entries yet. So `pnpm why react-native` shows nothing yet, and no new
  install scripts showed up to decide in `allowBuilds`. None of the main new
  packages (expo, react-native, reanimated, worklets, audio-api, uniwind,
  Panel UI, expo-sqlite, gesture-handler, screens, svg) has an
  install, preinstall or postinstall script on npm.

**Hacks**

- None.

**Drawbacks**

- Web loses the React fixes in 19.2.4–19.2.8. From now on the Expo SDK
  decides when web gets React upgrades (requirement 19).
- The published packages' exact `react` and `react-dom` peers moved from
  19.2.8 to 19.2.3 (changeset `react-follows-expo`). Apps using these packages
  on a newer React now get a peer warning.

**Open questions**

- react-native-audio-api 0.13.6 says nothing about RN 0.86. It needs a
  dev-build check before Ledger relies on it (requirement 14).
- panelui-native 0.105.1 and panelui-cli 0.6.2 are in the catalog only as a
  reference. Panel UI's source also needs `tailwind-variants`, `clsx`,
  `tailwind-merge` and `@hugeicons/*`, plus the uniwind peers (`metro`,
  `metro-cache`, `metro-transform-worker`, `@expo/metro-config`). Add those
  to the catalog in the step that copies the components.
- SDK 57 bundles both `expo-network` and `@react-native-community/netinfo`.
  Only `expo-network` is in the catalog.

**Cleanup owed**

- After 2026-10-07 12:12 UTC, move the whole set to expo 57.0.27 and its
  `bundledNativeModules.json` (one patch each for expo-router, expo-sqlite,
  expo-constants and expo-linking), and check `babel-preset-expo` 57.0.14.
- Once `@ledger/expo` installs the set, review `allowBuilds` for any build
  scripts deeper in the tree and confirm `pnpm why react-native` shows one
  version.
