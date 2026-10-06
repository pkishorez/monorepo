# Spec: ledger-on-expo

Source: the grilling session's brief (`plan.md` at the worktree root, kept
untracked), which supersedes the earlier version of this spec. That version
signed native Users in with Device Login; native signs in as an OAuth client
with PKCE instead (Ledger ADR 0009). The parity audit
(`ledger/docs/parity.md`) lists every web behaviour native must match.

## Outcome

Ledger runs natively on iOS, then Android, through Expo, at the same level of
finish as the web app, and web keeps working exactly as before. Every web
feature has a native counterpart at the end, or a written reason in
`ledger/NOTES.md` why not.

## Requirements

1. The native app is the same Ledger, not a demo: same Users, Backends,
   Places, Sections, Commands, Thumb Lock and Place Picker, with a native
   shell.
2. It targets iOS and Android only. Web stays on TanStack Start with its PWA,
   Splash and Worker; no Expo web build.
3. Ledger lives in `ledger/`: `core`, `web` and `expo`, named `@ledger/core`,
   `@ledger/web`, `@ledger/expo`, all private.
4. `@ledger/web` is full stack (pages, `/rpc`, Worker, infra), deployed in
   one go. `@ledger/expo` never hosts a server: it points at the Mac's local
   web dev server in development and `https://kstack.kishore.app` for
   production builds, read from `EXPO_PUBLIC_LEDGER_URL`, and at the shared
   sign-in service (`auth.kishore.computer` locally, `auth.kishore.app` in
   prod).
5. Each app hands core one platform Layer: storage (the Local Backend's
   table, Settings, Session copies, listing and deleting local copies),
   `Auth`, lifecycle (online, foreground) and the last-User store. Core
   imports nothing from `react-dom`, `react-native`, `window`, `document` or
   `indexedDB`, and a test enforces it.
6. Both apps run the Local Backend on the device: IndexedDB on web, SQLite on
   native, with sign-in by name.
7. One Expo Toolkit, `@kstackz/expo-toolkit`, in Laymos layers (patterns,
   components, input, feedback, theme) with subpath exports mirroring them.
   Storage and sign-in differences stay in std-toolkit and auth-toolkit as
   one more target each.
8. Panel UI is copied into the Expo Toolkit with its CLI, only the components
   Ledger needs, and owned from then on, keeping its MIT notice.
9. `@kstackz/use-gesture` splits into a platform-free core (pointer samples,
   direction, swipe decisions, the Thumb Picker's walk and tree) and a
   `./web` subpath; the Expo Toolkit feeds the core from Gesture Handler.
10. Expo Router, one thin route per Place, the Sidebar as a drawer; Go, Jump
    and Next call the router.
11. Expo Go on the iOS Simulator first; a development build (scheme
    `ledger://`) when a native module or the real scheme is needed.
12. Keys are left out of native for now; Settings hides them where there is
    no keyboard.
13. Gesture Haptics: as the Thumb Lock locks, at each Step, and when it goes;
    none on a Wrong Way; their own Haptics setting apart from Sounds.
14. Gesture Sounds on native match web; check the audio library's latency for
    short sounds and fall back to a preloaded player pool if it lags.
15. Native sign-in is OAuth authorization code with PKCE through the system
    sign-in sheet, as a fixed first-party public client (Ledger ADR 0009).
    Not better-auth's Expo plugin, not a custom token handoff.
16. Each User's short access token and rotating refresh token live in secure
    storage, one entry per User; Switch User changes the active one; Sign Out
    revokes the refresh token and deletes the entry.
17. The Remote Backend accepts access tokens whose audience is Ledger, beside
    session tokens.
18. pnpm keeps its default isolated layout; hoist only if forced, with the
    reason noted.
19. One React for the repo, matching Expo SDK 57's pin; React upgrades follow
    Expo's SDK.
20. A test sign-in exists only on the sign-in service's `local` stage, so
    agents can prove the OAuth flow; the service refuses to start with it on
    any other stage.
21. Every new or reshaped package has a `laymos.config.json` with layers, a
    layer graph, modules and module graphs, and `laymos lint` passes.
22. Order: restructure with no behaviour change; platform pieces; native on
    the Local Backend; native on the Remote Backend; parity pass; review.
