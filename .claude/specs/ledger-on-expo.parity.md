# Parity checklist: Ledger on Expo

Every user-observable behaviour of the web Ledger (`apps/kstack`) that `@ledger/expo` must match, one line each: the behaviour, then where it lives on web. Paths are under `apps/kstack/src/` unless they start with `toolkits/` or `apps/`. Words follow `apps/kstack/CONTEXT.md`. Items marked **n/a native** stay listed with the reason; items marked **native differs** are behaviours the spec changes on purpose (`.claude/specs/ledger-on-expo.md`).

## 1. Splash and start

- [ ] Splash on launch, before any Place: the Ledger mark over the name "Ledger" a little above the middle, "Powered by kstack" at the foot clear of the home indicator, on the dark theme's background. `apps/kstack/scripts/brand/splash.ts`, `entry/web/splash/splash.ts`
- [ ] The Ledger mark: a rounded square in `foreground` with three `background` bars, the last rising. `client/screens/parts/ledger-mark.tsx`
- [ ] Web draws the Splash only as iOS startup images per screen size; Android uses the manifest. **n/a native: Expo's splash config replaces `apple-touch-startup-image` tags.** `entry/web/splash/splash.ts`, `entry/web/splash/devices.ts`
- [ ] Before a Session, one centred card holds every state so nothing jumps: the mark, "Ledger", and "Write down what you spend and earn, and see where it goes. Keys on a desktop, a thumb on a phone." `client/screens/shell/signed-out.tsx` (`Card`)
- [ ] While checking: spinner and "Checking who is signed in…". `client/screens/shell/signed-out.tsx` (`Opening`), `client/screens/shell/shell.tsx`
- [ ] While a User's Session opens: "Opening {name}'s money…". `client/screens/shell/signed-out.tsx`
- [ ] While signing out: "Signing out…". `client/screens/shell/signed-out.tsx`
- [ ] The spinner spins only when motion is allowed (`motion-safe`). `client/screens/shell/signed-out.tsx`
- [ ] Ledger starts on the Backend saved in Settings (default Remote) and runs one app machine on it. `client/gate/gate.ts` (`boot`, `settledBackend`)
- [ ] With a User signed in, Ledger opens on the Place it was launched at; native opens on Home. `entry/web/routes/_ledger/*`
- [ ] Unknown address shows "404 / Nothing lives here" with a Home button. **n/a native: Expo Router has no free-typed URLs; an unknown route should still land on Home.** `entry/web/routes/__root.tsx` (`NotFound`)
- [ ] A Month address that is not `YYYY-MM` is not found. `entry/web/routes/_ledger/months/$month.tsx`
- [ ] Offline Fallback page "You're offline / This page needs the network" with Try again. **n/a native: the app bundle is always on the device.** `entry/web/routes/offline.tsx`
- [ ] PWA: update prompt, install prompt, service worker. **n/a native: store/dev-build updates instead.** `entry/web/routes/__root.tsx`

## 2. Backends

- [ ] Two Backends: Remote (Google, money kept for every device) and Local (any name, money never leaves the device). `client/domain/settings/settings.ts`, `client/backends/*`
- [ ] Every device starts on the Remote Backend. `client/domain/settings/settings.ts` (`defaultSettings`, v3 evolve)
- [ ] The chosen Backend is a device Setting, the same for every User. `client/state/settings/store.ts`
- [ ] Changing Backend runs Ledger on the other at once, without a reload, showing "Checking who is signed in…" meanwhile. `client/gate/gate.ts` (`setBackend`, `runOn`)
- [ ] Changing Backend signs no one out of either; each keeps its own Users. `client/gate/gate.ts`, `client/backends/local/local.ts`
- [ ] Backend changes queue: each waits for the one before. `client/gate/gate.ts` (`queue`)
- [ ] Signed out on Remote: "Or try Ledger on this device, without an account. Use the Local Backend". `client/screens/shell/signed-out.tsx` (`OtherBackend`)
- [ ] Signed out on Local: "Or sign in with Google, to keep your money on every device. Use Google". `client/screens/shell/signed-out.tsx`
- [ ] Settings > Users > Backend: a Flip showing Remote or Local, tap switches; hint "Remote keeps your money for every device… Local keeps it on this device… Each keeps its own users." `client/screens/places/settings/settings.tsx` (`Users`)
- [ ] A Backend another tab chose is followed when this tab becomes visible. **n/a native: one process, no tabs.** `client/gate/gate.ts` (`visibilitychange`)
- [ ] `?backend=local|remote` chooses the Backend, saves it, and leaves the address. **n/a native: no address bar; Settings is the only way.** `client/gate/gate.ts` (`backendFromAddress`)
- [ ] The Local Backend's code loads only when chosen. `client/gate/gate.ts` (`layerOf`)
- [ ] Remote: sign-in service is `auth.kishore.computer` in dev, `auth.kishore.app` in prod; Ledger API at the web origin's `/rpc`. **native differs: the Ledger URL comes from `EXPO_PUBLIC_LEDGER_URL` (the Mac's local web dev server in development, `https://kstack.kishore.app` in production builds); spec req 4.** `client/backends/remote/auth-url.ts`, `client/backends/remote/remote.ts`
- [ ] Remote calls carry the Session's own token and never the cookie. `client/backends/remote/remote.ts`, `client/state/session/rpc.ts`
- [ ] Local: the Backend's own handlers answer in-process from on-device storage (IndexedDB on web, SQLite on native). `client/backends/local/local.ts`, `server/backends/local/local.ts`
- [ ] Local: nobody opens offline (it is always there) and there are no copies to delete. `client/backends/local/local.ts` (`deviceLocal`)

## 3. Users

### Sign in

- [ ] Remote, signed out: the Google button (light or dark to match the theme), disabled and busy while starting. `client/screens/shell/signed-out.tsx` (`GoogleSignIn`)
- [ ] Remote: a sign-in that came back with an error shows it once ("Sign in didn't finish. Try again." or the error's description). `client/screens/shell/signed-out.tsx`, `client/gate/gate.ts` (`takeLoginError`)
- [ ] Remote: a sign-in that could not start shows "The sign-in service didn't answer. Try again." `client/screens/shell/signed-out.tsx`
- [ ] Remote, sign-in service unreachable with nobody to open offline: "Couldn't reach the sign-in service.", Try again, and the way to the Local Backend. `client/screens/shell/signed-out.tsx`, `client/domain/machine/machine.ts` (`unreachable`)
- [ ] Remote: signing in leaves for Google and comes back to the same Place with that User active. **native differs: OAuth + PKCE in the system sign-in sheet (ADR 0009, spec req 15); still returns to the same Place.** `client/gate/gate.ts` (`addUser`)
- [ ] Local, signed out: a "Sign in" button that opens the Local Sign-In dialog. `client/screens/shell/signed-out.tsx` (`LocalSignInButton`)
- [ ] Local Sign-In dialog: "Who should sign in?", "Nothing here leaves this device. Pick anyone to continue as.", presets Ada Lovelace and Grace Hopper, Email (required, "someone@example.com"), Name (optional), Sign in disabled until an email. `client/screens/shell/shell.tsx` (`PRESETS`), `toolkits/ui-toolkit/src/components/blocks/auth/local-sign-in/local-sign-in.tsx`
- [ ] Closing the Local Sign-In dialog signs nobody in. `client/screens/shell/shell.tsx` (`LocalSignInDialog`)

### Add User

- [ ] User Switcher > "Add user" signs one more User in and makes them the Active Session. `client/screens/shell/user-switcher.tsx`, `client/gate/gate.ts` (`addUser`)
- [ ] Add User is disabled offline. `client/screens/shell/user-switcher.tsx`
- [ ] Add User that fails to start shows the toast "Couldn't start adding a user. Try again." `client/screens/shell/user-switcher.tsx`
- [ ] Choosing a User already signed in on this device only switches to them. `apps/kstack/CONTEXT.md` (Add User), auth-toolkit `clients/auth`
- [ ] Local Add User asks through the same Local Sign-In dialog. `client/gate/gate.ts` (`useLocalSignIn`)

### Switch User

- [ ] Tapping another User in the User Switcher makes theirs the Active Session at once, signing nobody out. `client/gate/gate.ts` (`switchUser`), `client/domain/machine/machine.ts` (`SWITCH`)
- [ ] Choosing the User already open does nothing. `client/domain/machine/machine.ts`
- [ ] While switching, "Opening {name}'s money…" shows, then the same Place opens afresh for the new User (state reset). `client/screens/shell/shell.tsx` (`SessionProvider key`)
- [ ] Switch User reaches every tab. **n/a native: one process; the Active Session is still remembered across launches.** `client/domain/machine/check.ts` (`switchTo`)
- [ ] Each User's copy stays on the device until that User signs out. `client/domain/machine/check.ts`

### Sign Out

- [ ] User Switcher > "Sign out {name}" ends the open User on this device. `client/screens/shell/user-switcher.tsx`, `client/gate/gate.ts` (`signOut`)
- [ ] Sign Out is disabled offline, and while the open User was opened offline with no token yet. `client/screens/shell/user-switcher.tsx` (`reached`), `client/domain/machine/machine.ts`
- [ ] After Sign Out, "Signing out…", then another signed-in User opens, or with nobody left Ledger is signed out. `client/domain/machine/machine.ts` (`signingOut` → `checking`)
- [ ] The signed-out User's copy of their money leaves the device. `client/domain/machine/check.ts` (`keepCopies`), `client/state/local-copies/local-copies.ts`
- [ ] **native differs:** Sign Out also revokes that User's refresh token and deletes their tokens from secure storage. spec req 16

### Sign out everyone

- [ ] Settings > Users > "Sign out everyone", hint "Every user leaves this browser, and their money leaves this device." (native wording: this device). `client/screens/places/settings/settings.tsx` (`Users`)
- [ ] It asks first: "Sign out?" for one User, "Sign out all {n} users?" for more; "Each one's money leaves this device and stays in their account. Other apps that share this sign-in sign out of this browser too."; Cancel / Sign out everyone (destructive). `client/screens/places/settings/settings.tsx` (`SignOutEveryone`)
- [ ] Disabled offline or with nobody signed in. `client/screens/places/settings/settings.tsx`
- [ ] Signs every User out of this Backend and deletes every copy, then shows signed out. `client/gate/gate.ts` (`signOutEveryone`), `client/domain/machine/machine.ts` (`SIGN_OUT_EVERYONE`)

### User Switcher

- [ ] At the top of the Sidebar: the Ledger mark, "Ledger", the open User's name, an up-down chevron. `client/screens/shell/user-switcher.tsx`
- [ ] Opens a menu: "Signed in on this device", each User with avatar (image, else first letter), name and email, a check on the open one. `client/screens/shell/user-switcher.tsx`
- [ ] Then a separator, "Add user", "Sign out {name}" (truncated). `client/screens/shell/user-switcher.tsx`
- [ ] It is a Sidebar item the Sidebar keys move through. **n/a native: keys.** `client/screens/shell/user-switcher.tsx` (`data-sidebar-item`)

### Manage Google Accounts

- [ ] Settings > Users > "Manage Google accounts", only on the Remote Backend, hint "Where {email} is signed in, and the apps it lets in, at the sign-in service.", button "Manage" opening the sign-in service in a new tab (native: system browser). `client/screens/places/settings/settings.tsx` (`Users`), `client/backends/remote/auth-url.ts`

## 4. Places and Sections

### Shell around every Place

- [ ] Header: sidebar toggle button ("Toggle sidebar"), divider, the Place's title, then actions. `toolkits/ui-toolkit/src/components/blocks/app-shell/header.tsx`
- [ ] Title: Home, Entries, Entry, Months, the Month's name ("October 2026"), Settings. `client/screens/shell/frame.tsx` (`titleOf`)
- [ ] Header shows "Offline" with a wifi-off icon while offline. `client/screens/shell/frame.tsx` (`HeaderActions`)
- [ ] Header "Add" button with its key, only with a keyboard. **n/a native: keyboard only.** `client/screens/shell/frame.tsx`
- [ ] Round + button bottom right (56px, `primary`, above the safe area), only on touch; presses to 95%; disabled (40% opacity) offline; runs Add. `client/screens/shell/frame.tsx` (`AddButton`)
- [ ] Toasts at the top centre. `client/screens/shell/frame.tsx` (`Toaster`)
- [ ] Each Place pads its foot (`pb-28`) so the + button never covers the last row. `client/screens/places/*`
- [ ] Places size to the page, not the window; two columns from 48rem of page width. `client/screens/parts/page.tsx` (`useWide`)
- [ ] Opening a Place makes its Surface the active one (keys and Commands answer for it). `client/screens/parts/place.ts` (`usePlace`)
- [ ] Place order: Home, Entries, Months, Settings. `client/screens/shell/places.ts` (`PLACES`)

### Home

- [ ] A new User with no Accounts sees Welcome: mark, "Welcome, {first name}", the explainer, "Start with sample money" and "Start empty"; both disabled while busy or offline. `client/screens/places/home/home.tsx` (`Welcome`)
- [ ] "Start with sample money" writes Cash, Bank, Card, Savings, ten Categories with Budgets, and three Months of Entries; "Start empty" writes the Accounts and Categories only; neither runs if Accounts exist. `shared/ledger/sample.ts`, `server/domain/ledger/ledger.ts` (`Ledger.Sample`)
- [ ] The sample is the same for the same User (seeded by User id). `shared/ledger/sample.ts` (`randomOf`)
- [ ] Glance: this Month's name, "Left this month" large (in `destructive` when negative). `client/screens/places/home/home.tsx` (`Glance`)
- [ ] In and Out bars, each against the larger of the two; In in `muted-foreground/50`, Out in `foreground`; amounts right-aligned. `client/screens/places/home/home.tsx` (`Bar`)
- [ ] Budgets section, only if any Category has a Budget: each with icon, name, "{spent} of {budget}" compact, a bar, sorted fullest first; over budget turns the text and bar `destructive`; bar capped at 100%. `client/screens/places/home/home.tsx`
- [ ] Budgets "See all" goes to this Month. `client/screens/places/home/home.tsx` (`Heading`)
- [ ] Latest: the newest six Entries; tap opens the Entry; "See all" goes to Entries. `client/screens/places/home/home.tsx`
- [ ] Bars animate their width (500 ms). `client/screens/places/home/home.tsx`

### Entries (The List of an Entry)

- [ ] Every Entry newest first, grouped by day under a sticky header with the day ("Today", "Yesterday", "Mon, Oct 5") and the day's net signed amount. `client/screens/places/entries/list.tsx`, `shared/ledger/month.ts` (`dayName`)
- [ ] Entry row: Category icon, memo (else Category name, else "Entry"), "{Category} · {Account}" ("No category" / "No account"), signed amount. `client/screens/parts/entry-row.tsx`
- [ ] Narrowed by Account, Category and/or Month (from the Sidebar, a Month, or Home): a header "Card · Food · March 2026" with "Everything ×" to clear. `client/screens/places/entries/filter.ts`, `client/screens/places/entries/list.tsx`
- [ ] Narrowed by an Account: a "Rename" button opening the Account sheet for it. `client/screens/places/entries/list.tsx`
- [ ] Empty: inbox icon and "No entries here yet." `client/screens/places/entries/list.tsx`
- [ ] One Entry is marked: the one given (`at`), else the open one, else the first; the mark follows the open Entry and stays scrolled into view smoothly. `client/screens/places/entries/list.tsx`
- [ ] The marked row shows `accent` while the list is active or no Entry is open. `client/screens/places/entries/list.tsx`
- [ ] Tap a row: marks it and opens the Entry. `client/screens/places/entries/list.tsx`
- [ ] Wide page: list (24rem) and the open Entry side by side, each scrolling on its own; with none open, "Open an entry". `client/screens/places/entries/entries.tsx`
- [ ] Narrow page: list or Entry, one at a time. `client/screens/places/entries/entries.tsx`
- [ ] Wide with an Entry open, moving the mark opens that Entry in place (replacing history). `client/screens/places/entries/list.tsx` (`markEntry`)
- [ ] Delete from the list: the Entry goes at once, the mark moves to the next (else previous), and a toast "Deleted {memo|the entry}" with Undo. `client/screens/places/entries/list.tsx` (`remove`)
- [ ] Swipe a row left to delete: Delete with a trash icon shows behind it from 24px, arms past 112px (background deepens, label pops to 115%), letting go then slides it away (180 ms) and deletes; short, it springs back. `client/screens/places/entries/swipe-row.tsx`
- [ ] Swipe-to-delete works with the Thumb Lock switched off. `client/screens/places/settings/gestures-tab.tsx` (hint)
- [ ] A mouse never swipes a row. **n/a native: touch only.** `client/screens/places/entries/swipe-row.tsx`

### An Entry

- [ ] Every part changes where it stands and saves as it changes; another device's change shows unless that field is being typed in. `client/screens/places/entries/entry.tsx` (`Editor`)
- [ ] Top row: back arrow (narrow only), "{n} of {N}" in the current narrowing, Previous and Next entry buttons, disabled at the ends. `client/screens/places/entries/entry.tsx`
- [ ] Category icon in a circle; the amount large, decimal keypad, comma typed as dot; saved on blur or Enter if above 0 and changed, else put back. `client/screens/places/entries/entry.tsx` (`saveAmount`), `shared/ledger/money.ts` (`centsOf`)
- [ ] Line under: "Money in|out · {day} · {signed amount}". `client/screens/places/entries/entry.tsx`
- [ ] Memo: two-line field "What was it?", saved trimmed on blur. `client/screens/places/entries/entry.tsx`
- [ ] Money: Out / In pills. Category: every Category as pills with icons. Account: every Account as pills with icons. `client/screens/places/entries/entry.tsx`, `client/screens/parts/choice.tsx`
- [ ] Day: a date field, no later than today. `client/screens/places/entries/entry.tsx`
- [ ] Delete (destructive): deletes, toasts with Undo, and opens the next Entry, else the previous, else the list. `client/screens/places/entries/entry.tsx` (`remove`)
- [ ] Back (narrow): to the list with this Entry marked; (wide) gives the list the keys. `client/screens/places/entries/entry.tsx` (`back`)
- [ ] Next/Previous Entries replace history rather than stacking it. `client/screens/places/entries/entry.tsx` (`go`)
- [ ] A missing Entry shows "This entry is gone." once money is ready. `client/screens/places/entries/entry.tsx`
- [ ] Field labels show key hints (e, i, d d). **n/a native: Keys hidden.** `client/screens/places/entries/entry.tsx` (`Field`)

### Months (The List of a Month)

- [ ] Every Month with Entries, each a card: name, "Left {amount}" (destructive when negative), In and Out lines against the largest across Months, compact amounts. `client/screens/places/months/months.tsx`, `shared/ledger/sums.ts` (`monthsOf`)
- [ ] One Month is marked (`at`, else the first) in `accent`, kept in view. `client/screens/places/months/months.tsx`
- [ ] Tap a Month: marks and opens it. `client/screens/places/months/months.tsx`
- [ ] Empty: calendar icon and "Months show up once there are entries." `client/screens/places/months/months.tsx`

### A Month

- [ ] Title (Month name) with Earlier and Later buttons; never later than this Month or earlier than the first Entry's; turning replaces history. `client/screens/places/months/month.tsx`
- [ ] In / Out / Left stat cards, compact; Left destructive when negative. `client/screens/places/months/month.tsx` (`Stat`)
- [ ] "Each day": a bar per day of money out (min 3% tall, empty days `muted`). `client/screens/places/months/month.tsx` (`dailySpend`)
- [ ] "Where it went": each Category spent, "{amount} of {budget}", a bar (destructive over budget) with a Budget marker; tap goes to Entries narrowed to that Month and Category. `client/screens/places/months/month.tsx`
- [ ] "Its entries" link to Entries narrowed to the Month; "Nothing went out this month." when empty. `client/screens/places/months/month.tsx`
- [ ] Back (Jump) goes to Months with this Month marked. `client/screens/places/months/month.tsx` (`back`)

### Settings and each Section

- [ ] Three Sections as tabs, in order: General, Keys, Gestures; the tab bar stays at the top while the Section scrolls. `client/screens/places/settings/settings.tsx`
- [ ] The Section is part of the address (`?tab=keys`, none for General) and changes replace history; an unknown tab is General. `entry/web/routes/_ledger/settings.tsx` (native: a route param)
- [ ] Swipe left or right turns the Section under the finger; past 60px or a light flick (300 px/s) it settles on the next/previous, else springs back (spring 0.15 s, carrying the finger's speed). `client/screens/places/settings/settings.tsx` (`Pages`)
- [ ] On the first Section a swipe right is not the tabs': it opens the Sidebar. `client/screens/places/settings/settings.tsx`
- [ ] Tapping a tab slides to it; Sections not in view are inert and flat. `client/screens/places/settings/settings.tsx`
- [ ] Settings is its own Gesture Zone so its swipes come before the Sidebar's. `client/screens/places/settings/settings.tsx`
- [ ] General > Look and sound: Theme (Flip Light with sun / Dark with moon) and Sounds switch, hint "Quiet sounds as commands run, from a key, a tap or a gesture." `client/screens/places/settings/settings.tsx` (`Appearance`)
- [ ] General > App > Install on home screen (browser only, with iOS steps or browser menu dialog). **n/a native: it is installed.** `client/screens/places/settings/app-section.tsx` (`Install`)
- [ ] General > App > Version: hint "Deployed {date} · {commit}"; Check for updates / Checking… / Up to date / Update now / Updating…. **native differs: show the app version and build; no PWA update.** `client/screens/places/settings/app-section.tsx` (`Version`)
- [ ] General > Your money: "{n} entries in {m} accounts, kept on this device only." (Local) or "… kept on this device and in your account." (Remote). `client/screens/places/settings/settings.tsx` (`Data`)
- [ ] General > Your money > Currency: USD, EUR, GBP, INR, JPY; default USD; per User, synced. `shared/ledger/money.ts` (`CURRENCIES`), `shared/ledger/schemas.ts` (`defaultPreferences`)
- [ ] General > Your money: "Load sample money" when there are no Accounts. `client/screens/places/settings/settings.tsx`
- [ ] General > Your money: "Delete everything", tapped again as "Delete everything, for good" (destructive) to delete every Account, Category and Entry; disabled offline or busy. `client/screens/places/settings/settings.tsx`, `server/domain/ledger/ledger.ts` (`Ledger.Clear`)
- [ ] General > Users: Backend, Manage Google accounts, Sign out everyone (see sections 2 and 3). `client/screens/places/settings/settings.tsx` (`Users`)
- [ ] Keys Section: "Keyboard shortcuts" switch, hint "A key for every command. With them off, ⌘K still finds one."; every Command's keys by group; tap to record new keys (900 ms settle, one key a Shortcut, more a Sequence; only Escape works while recording; "Press keys…"); Reset per changed Command. **n/a native: no keyboard; the Keys Section and its Place Picker Section are hidden (spec req 12).** `client/screens/places/settings/keys-tab.tsx`
- [ ] Gestures Section: "Thumb Lock" switch, hint "Two-finger commands on a touch screen. Taps, the sidebar swipe and swiping a row to delete always work." `client/screens/places/settings/gestures-tab.tsx`
- [ ] Gestures Section: "The Thumb Lock" explainer card with its figure and text. `client/screens/places/settings/gestures-tab.tsx`
- [ ] Gestures Section: every gesture by Place (Everywhere, Entries > An entry, Months > A month, Add), each "does" with how it is said ("Thumb Lock, swipe up", "Swipe right", "Drag the sheet down", "Tap"). `client/commands/gestures.ts` (`GESTURE_GUIDE`), `client/screens/places/settings/gestures-tab.tsx`
- [ ] Gesture figures: dots on a small screen (thumb ringed at the left), play once on coming into view, again on tap (and hover on web), still for reduced motion. `client/screens/places/settings/figure.tsx`
- [ ] **native differs:** a Gesture Haptics switch, apart from Sounds (spec req 13). `apps/kstack/CONTEXT.md` (Gesture Haptics)

## 5. Sheets

### Add

- [ ] Opens from Add (the + button or `c`), only online; a sheet from the bottom with a grip; each opening a fresh Entry. `client/screens/sheets/add/add.tsx`, `client/screens/shell/globals.tsx`
- [ ] On touch it opens in place without sliding up, so the focused amount lands right. `client/screens/sheets/add/add.tsx`
- [ ] Only the grip drags it closed (down); dragging the form scrolls it. `client/screens/sheets/add/add.tsx` (`data-base-ui-swipe-ignore`)
- [ ] Wide screens (≥ sm): a centred card, no grip. **n/a native phones; tablets may follow.** `client/screens/sheets/add/add.tsx`
- [ ] "Money out" / "Money in" pills, out by default. `client/screens/sheets/add/add.tsx`
- [ ] Amount focused at once, decimal keypad, "0.00" placeholder, comma as dot; under it the signed formatted amount, else the currency code. `client/screens/sheets/add/add.tsx`
- [ ] Category pills of that way only, the first chosen; switching way re-chooses. `client/screens/sheets/add/add.tsx` (`fits`)
- [ ] Account pills, the Card Account chosen, else the first. `client/screens/sheets/add/add.tsx`
- [ ] Memo "What was it?". `client/screens/sheets/add/add.tsx`
- [ ] Day: Today / Yesterday pills and "Another day" date field, no later than today. `client/screens/sheets/add/add.tsx`
- [ ] Save disabled until an amount above 0, a Category and an Account; saving writes the Entry (shows at once), closes, and plays coin. `client/screens/sheets/add/add.tsx`, `client/commands/feedback.ts`
- [ ] Closing returns to the Place it opened over. `client/screens/sheets/add/add.tsx`
- [ ] Key hints on Save (⌘↵) and way (⌘I). **n/a native: Keys hidden.** `client/screens/sheets/add/add.tsx`

### Account sheet

- [ ] "New account": name ("Name, like Everyday card", focused), Kind pills Cash, Card, Bank, Savings (Bank chosen), Cancel / "Add account". `client/screens/sheets/accounts/account-sheet.tsx`
- [ ] "Rename account": the name only, Cancel / "Rename". `client/screens/sheets/accounts/account-sheet.tsx`
- [ ] Submit disabled with an empty name or offline. `client/screens/sheets/accounts/account-sheet.tsx`
- [ ] Opened from the Sidebar's Accounts +, the Sidebar's "Add an account" row, and Entries' "Rename"; an Account is never deleted. `client/screens/shell/sidebar.tsx`, `client/screens/places/entries/list.tsx`
- [ ] Fresh form each opening; closing returns to where it opened. `client/screens/sheets/accounts/account-sheet.tsx`

### Palette (Find a Command)

- [ ] Opens with ⌘K / Ctrl K, even in a text field and with Keys off. **n/a native: opened only by a key; no touch entry exists on web.** `client/commands/keys.ts` (`openPalette`), `client/commands/bindings.ts` (`KEPT`)
- [ ] Lists every Command that works where it opened, filtered by description as you type ("What would you like to do?"), "No command by that name here." when none. **n/a native: as above.** `client/screens/sheets/palette/palette.tsx`
- [ ] Shows each Command's keys, and its gesture on touch. **n/a native: as above.** `client/screens/sheets/palette/palette.tsx`
- [ ] Runs the chosen Command after closing back to where it opened; a tap outside closes. **n/a native: as above.** `client/screens/sheets/palette/palette.tsx`

## 6. Commands

Where: G = every Place (Globals), H = Home, E = Entries list, N = an Entry, M = Months, O = a Month, S = Settings. Sheets open over a Place take the keys from it (Add, Account and palette are isolated). Every Command, from a key, the palette or a gesture, plays its sound and shows in the Key Bar, except Goes given by the Thumb Lock (section 7). On native, keys are **n/a native: no keyboard (spec req 12)**; the gesture column is what native must match. Source: `client/commands/keys.ts`, `client/commands/gestures.ts`, handlers as listed.

| id                               | key                 | gesture (web touch)                                       | where                                                                        | handler                                                                          |
| -------------------------------- | ------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `openPalette`                    | ⌘K                  | none                                                      | G, sheets, text fields                                                       | `screens/sheets/palette/palette.tsx`                                             |
| `addEntry`                       | c                   | Tap +                                                     | G, online only                                                               | `screens/shell/globals.tsx`                                                      |
| `jump`                           | -                   | none (Thumb Lock up from an Entry/Month reaches the list) | H → Entries; N → list with it marked; O → Months with it marked; not E, M, S | `places/home/home.tsx`, `places/entries/entry.tsx`, `places/months/month.tsx`    |
| `next`                           | j, ↓ (repeats)      | none (Next entry / Later month buttons)                   | E mark next; N open next; M mark next; O later Month                         | `entries/list.tsx`, `entries/entry.tsx`, `months/months.tsx`, `months/month.tsx` |
| `previous`                       | k, ↑ (repeats)      | none (Previous / Earlier buttons)                         | as `next`, backwards                                                         | same                                                                             |
| `toHome`                         | g h                 | Thumb Lock Step                                           | G                                                                            | `screens/shell/globals.tsx`                                                      |
| `toEntries`                      | g e                 | Thumb Lock Step                                           | G                                                                            | same                                                                             |
| `toMonths`                       | g m                 | Thumb Lock Step                                           | G                                                                            | same                                                                             |
| `toSettings`                     | g s                 | Thumb Lock Step                                           | G                                                                            | same                                                                             |
| `toGeneralSettings`              | none                | Thumb Lock to Settings, right                             | G                                                                            | same                                                                             |
| `toKeysSettings`                 | none                | Thumb Lock to Settings, right                             | G (**n/a native: Keys Section hidden**)                                      | same                                                                             |
| `toGesturesSettings`             | none                | Thumb Lock to Settings, right                             | G                                                                            | same                                                                             |
| `toggleSidebar`                  | [                   | Swipe right (open) / left (close)                         | G                                                                            | `screens/shell/globals.tsx`                                                      |
| `focusSidebar`                   | Space e             | none                                                      | G (**n/a native**)                                                           | `screens/shell/sidebar.tsx`                                                      |
| `theme`                          | t                   | none (Settings Theme Flip)                                | G                                                                            | `screens/shell/globals.tsx`                                                      |
| `help`                           | ?                   | none                                                      | G → Settings Keys (**n/a native**)                                           | `screens/shell/globals.tsx`                                                      |
| `sidebar.down` / `sidebar.up`    | j ↓ / k ↑           | none                                                      | Sidebar with the keys (**n/a native**)                                       | `screens/shell/sidebar.tsx`                                                      |
| `sidebar.leave`                  | Esc                 | none                                                      | Sidebar with the keys (**n/a native**)                                       | same                                                                             |
| `home.open`                      | Enter               | none (Budgets "See all")                                  | H → this Month                                                               | `places/home/home.tsx`                                                           |
| `entries.open`                   | Enter, l            | Tap the row                                               | E                                                                            | `entries/list.tsx`                                                               |
| `entries.top` / `entries.bottom` | g g / ⇧G            | none                                                      | E (**n/a native**)                                                           | same                                                                             |
| `entries.remove`                 | d d                 | Swipe the row left                                        | E                                                                            | same                                                                             |
| `entries.undo`                   | u                   | none (toast Undo)                                         | E                                                                            | same                                                                             |
| `entries.entry.back`             | Esc, h              | none (back arrow)                                         | N                                                                            | `entries/entry.tsx`                                                              |
| `entries.entry.edit`             | e                   | none (tap the memo)                                       | N                                                                            | same                                                                             |
| `entries.entry.remove`           | d d                 | none (Delete button)                                      | N                                                                            | same                                                                             |
| `entries.entry.way`              | i                   | none (Out/In pills)                                       | N                                                                            | same                                                                             |
| `months.open`                    | Enter, l            | Tap the month                                             | M                                                                            | `months/months.tsx`                                                              |
| `months.month.back`              | Esc, h              | none                                                      | O                                                                            | `months/month.tsx`                                                               |
| `months.month.open`              | Enter               | none ("Its entries")                                      | O → Entries for the Month                                                    | same                                                                             |
| `add.save`                       | ⌘↵ (in fields)      | none (Save)                                               | Add                                                                          | `sheets/add/add.tsx`                                                             |
| `add.way`                        | ⌘I (in fields)      | none (pills)                                              | Add                                                                          | same                                                                             |
| `add.cancel`                     | Esc                 | Drag the sheet down                                       | Add                                                                          | same                                                                             |
| `palette.down` / `palette.up`    | ↓ Ctrl N / ↑ Ctrl P | none                                                      | palette (**n/a native**)                                                     | `sheets/palette/palette.tsx`                                                     |
| `palette.run` / `palette.close`  | Enter / Esc         | none                                                      | palette (**n/a native**)                                                     | same                                                                             |
| `account.cancel`                 | Esc                 | none (Cancel, tap outside)                                | Account sheet                                                                | `sheets/accounts/account-sheet.tsx`                                              |
| `settings.recording.cancel`      | Esc                 | none                                                      | Keys recording (**n/a native**)                                              | `places/settings/keys-tab.tsx`                                                   |

- [ ] Every Command above that has a touch way works on native in exactly the Places listed. `client/commands/keys.ts`
- [ ] A Command's on-screen button (chevrons, back arrow, Delete, pills, Cancel) does the same as its key; on web those buttons call the handler directly, without the Command's sound or Key Bar. `client/screens/places/entries/entry.tsx`, `client/screens/places/months/month.tsx`
- [ ] A Command whose handler is disabled does nothing (e.g. `next` at the last Entry, Add offline). `client/commands/feedback.ts` (`useCommand` options)
- [ ] Sidebar links Go without a Command (no sound, no Key Bar). `client/screens/shell/sidebar.tsx`
- [ ] Custom key Bindings and the Keys switch (`keysOff`: everything but the palette and open sheets loses its key). **n/a native: no keyboard.** `client/commands/bindings.ts`
- [ ] Key labels per platform (⌘ vs Ctrl, ↵, Esc, Space). **n/a native.** `client/commands/binding-keys.tsx`

## 7. Thumb Lock, Step, Place Picker, Wrong Way

### Thumb Lock (`client/kit/thumb-picker/lock.ts`)

- [ ] The thumb is the first finger down, and only if it lands in the left half of the screen's width.
- [ ] The Lock holds when a second finger lands while the thumb has drifted no more than 14px.
- [ ] From then on both fingers own the touch; a one-finger swipe is left alone, so the page scrolls and the Sidebar swipe works.
- [ ] Lifting the moving finger ends the swipe as lifted (it Goes); lifting the thumb first calls it off (goes nowhere).
- [ ] The thumb may stay down for another swipe.
- [ ] Off when the Thumb Lock switch is off, and while no Go is reachable (an isolated sheet is open). `client/screens/shell/thumb.tsx` (`enabled`)
- [ ] Taps, the Sidebar swipe and swipe-to-delete keep working with it off. `client/screens/places/settings/gestures-tab.tsx`

### Step and the walk (`client/kit/thumb-picker/walk.ts`, tests in `tests/walk.test.ts`)

- [ ] Nothing shows until the finger is 14px from where it landed (reveal), or the first move; a Lock that never moves shows nothing.
- [ ] Each 30px from where the finger last moved something is one move, up/down/sideways, whichever axis is more.
- [ ] A fast move makes several Steps at once, each told.
- [ ] Turning around counts from where it turned, even far past an end.
- [ ] Past either end it holds; the order does not wrap; no Wrong Way for up/down.
- [ ] Only the axis moved counts on; the other starts over from there (a sideways drift while Stepping is ignored).
- [ ] The walk starts on where you are; a start not in the tree starts on the first.
- [ ] Right on a Place with Sections opens them, on: the Section last reached there in this swipe, else the one you are on, else the first.
- [ ] Left goes back to the Places, remembering the Section marked.
- [ ] Lifting chooses the marked one, unless it is where the swipe began or on the way to it (then nothing).
- [ ] The distances are 14 and 30 unless told; tests cover each of the above and must move with the walk to the Expo Toolkit.

### What it picks from (`client/screens/shell/places.ts`, tests in `screens/shell/tests/places.test.ts`)

- [ ] Places in order: Home, Entries, Months, Settings.
- [ ] On an Entry, "This entry" sits just under Entries; on a Month, its name sits just under Months; the swipe starts there, so up goes to the list.
- [ ] Lifting on "This entry" / the Month goes nowhere (it is where you are).
- [ ] With any Accounts, "Accounts" sits before Settings; right opens each Account; lifting on one goes to Entries narrowed to it, as the Sidebar does; lifting on "Accounts" itself goes nowhere.
- [ ] On Entries narrowed to an Account, the swipe starts on that Account inside Accounts.
- [ ] Settings opens General, Keys, Gestures; on Settings the swipe starts on its Section. **native differs: no Keys Section.**
- [ ] Each row shows the Place's icon and label (Home house, Entries list, Months calendar range, Settings gear, Accounts wallet, Account by kind, This entry file, Month calendar days, General sliders, Keys keyboard, Gestures hand).
- [ ] A Go lifts through the same Command as its key; a Go whose key another Surface shadows still runs for a finger. `client/screens/shell/thumb.tsx` (`goes`)

### Place Picker (`client/kit/thumb-picker/menu.tsx`, `list.tsx`)

- [ ] At the top centre (6rem below the safe area), never under the fingers, over everything dimmed (black 40%) and blurred.
- [ ] Zooms in as it shows (from 94%, fade 160 ms), out as it goes.
- [ ] The marked row is under an `accent` highlight that springs from row to row (0.18 s); marked text medium weight, others' icons muted.
- [ ] A small dot "Where you are" beside where the swipe began.
- [ ] A chevron on each row with Sections inside, nudged right and darkened when marked.
- [ ] Opening Sections slides the new list in from the right (56px); the Places draw back to the top left (−104, −28 per level), 10% smaller and half faded; going back slides it out.
- [ ] Rounded `popover` cards with border and shadow; min width 11rem.
- [ ] Nothing moves for reduced motion (shown at once, no shake).
- [ ] Announced politely to screen readers (`aria-live`).

### Wrong Way

- [ ] Sideways where there is nowhere to go (right with no Sections, left among the Places) is a Wrong Way, told once per push in that direction. `client/kit/thumb-picker/walk.ts`
- [ ] The Place Picker shakes once (0, −6, 5, −3, 2, 0 px over 320 ms). `client/kit/thumb-picker/menu.tsx`
- [ ] No sound, no buzz on a Wrong Way. `client/screens/shell/thumb.tsx`
- [ ] Turning from a Wrong Way counts from where it turned. `client/kit/thumb-picker/tests/walk.test.ts`

## 8. Sidebar

- [ ] Content top to bottom: User Switcher; Home, Entries, Months; "Accounts" with a + to add one, each Account with icon, name and balance (muted; negative with −), or "Add an account" when none; Settings at the foot. `client/screens/shell/sidebar.tsx`
- [ ] The Accounts group shows once money is ready. `client/screens/shell/sidebar.tsx`
- [ ] The active item is marked: the Place you are on, or the Account Entries is narrowed to (then no Place is). `client/screens/shell/sidebar.tsx`
- [ ] Each Place shows its key hint (60%). **n/a native.** `client/screens/shell/sidebar.tsx`
- [ ] Phone (under 768px): the Sidebar sits under the page; opening moves the page aside 18rem, shrinks it 8%, rounds it 2rem and dims it (30% light, 50% dark); the Sidebar slides in 20% and fades up. `toolkits/ui-toolkit/src/components/blocks/app-shell/frame/geometry.ts`
- [ ] Wide: the Sidebar (16rem) sits beside the page, which is a card with a 0.5rem margin; crossing the breakpoint morphs. **Tablets only on native.** `toolkits/ui-toolkit/src/components/blocks/app-shell/frame/frame.tsx`
- [ ] Starts shut on a phone, open on a wide screen. `toolkits/ui-toolkit/src/components/blocks/app-shell/frame/state.ts`
- [ ] On touch, a one-finger swipe right from anywhere opens it under the finger, left shuts it; it springs (0.3 s, no bounce) on release. `toolkits/ui-toolkit/src/components/blocks/app-shell/frame/motion.ts`
- [ ] Its screen edge is its own: the 24px strip at the left edge is kept from the system back swipe, and covers the Sidebar's items there so a swipe from the edge never taps a link. **native: disable the stack's edge-back gesture where the Sidebar owns the edge.** `toolkits/ui-toolkit/src/components/blocks/app-shell/frame/frame.tsx`, `apps/kstack/CONTEXT.md` (Sidebar)
- [ ] Zones nest: the page's Thumb Lock hears first, then the Sidebar swipe; Settings and each row are zones of their own. `client/screens/shell/frame.tsx`
- [ ] While open on a phone the page is inert; a tap on it shuts the Sidebar. `toolkits/ui-toolkit/src/components/blocks/app-shell/frame/frame.tsx`
- [ ] Tapping a link in it on a phone Goes and shuts it. `toolkits/ui-toolkit/src/components/blocks/app-shell/blocks.tsx` (`useShutOnPhone`)
- [ ] The status bar takes the page's colour while shut and the Sidebar's while open (light #ffffff / #fafafa, dark #0a0a0a / #151515). `client/screens/shell/frame.tsx` (`STATUS_BAR`)
- [ ] Escape shuts it on a phone; Space E gives it the keys, J/K move, Enter Goes, Escape gives them back and re-shuts it if it was shut; focus leaving it or Going gives the page the keys. **n/a native: keys.** `client/screens/shell/sidebar.tsx` (`useSidebarKeys`)
- [ ] Desktop resize handle for its width. **n/a native.** `toolkits/ui-toolkit/src/components/blocks/app-shell/sidebar/resize-handle.tsx`

## 9. Key Bar

- [ ] One bar at the bottom centre over the page (raised above the + button on touch), never moving what is under it; `popover` with border and shadow. `client/screens/shell/key-bar.tsx`
- [ ] A Command given shows its description (and first key where Keys show) for 1.4 s; a new one replaces it in place; only the last fades (150 ms). `client/screens/shell/key-bar.tsx`
- [ ] On touch it shows Commands given by taps (e.g. "Add an entry" from +) without key hints. `client/screens/shell/key-bar.tsx`, `client/commands/binding-keys.tsx`
- [ ] A Thumb Lock Go does not show in it (the picker showed it). `client/screens/shell/thumb.tsx` (`quietly`)
- [ ] A Sequence under way shows the keys pressed "then" each way to finish it. **n/a native: keys.** `client/screens/shell/key-bar.tsx`
- [ ] A key that finishes no Sequence (none given within 60 ms) shows "… then that does nothing", shakes, and goes after 0.9 s. **n/a native: keys.** `client/screens/shell/key-bar.tsx`
- [ ] Enter animation: fade and rise 6px from 98%, 180 ms, `cubic-bezier(0.23, 1, 0.32, 1)`. `client/screens/shell/key-bar.tsx`

## 10. Gesture Sounds, every other sound, and haptics

All sounds are synthesized as they play, under 150 ms, quiet; master gain 0.9; none play when Settings > Sounds is off. `client/kit/sound/sound.ts`, `client/commands/feedback.ts`

- [ ] `tick` (1850→1400 Hz sine, 25 ms): `next`, `previous`, palette and Sidebar up/down. `client/commands/feedback.ts`
- [ ] `open` (noise swept 500→2400 Hz, 120 ms): `addEntry`, `openPalette`, `focusSidebar`. same
- [ ] `close` (noise swept 2200→450 Hz, 110 ms): `sidebar.leave`, `add.cancel`, `account.cancel`, `palette.close`, `settings.recording.cancel`. same
- [ ] `coin` (1568 then 2093 Hz triangle): `add.save`. same
- [ ] `theme` (880/1320/1760 Hz chord): `theme`. same
- [ ] `confirm` (660 then 990 Hz triangle): every other Command. same
- [ ] Gesture Sounds: `tick` as the Thumb Lock locks and at each Step, opening and going back. `client/screens/shell/thumb.tsx`
- [ ] Gesture Sounds: `success` (1320→1760 Hz, soft) when the Thumb Lock Goes, instead of the Command's own sound. `client/screens/shell/thumb.tsx`
- [ ] Wrong Way: silent. `client/screens/shell/thumb.tsx`
- [ ] Swipe-to-delete: `arm` (1180→1320 Hz triangle) as it arms, `success` as it deletes. `client/screens/places/entries/swipe-row.tsx`
- [ ] `wrong` sound exists but nothing plays it. `client/kit/sound/sound.ts`
- [ ] Web buzzes `navigator.vibrate(4)` at each Step, open and back (not on lock, not on Wrong Way), and `vibrate(8)` as a row arms, following no setting. **native differs: Gesture Haptics — a buzz as the Thumb Lock locks, at each Step, and when it goes, none on a Wrong Way, behind their own Haptics setting (spec req 13).** `client/screens/shell/thumb.tsx`, `client/screens/places/entries/swipe-row.tsx`
- [ ] Sound starts only after the first touch or key (browser rule). **n/a native: `react-native-audio-api` has no such gate; sound must still match.** `client/kit/sound/sound.ts`

## 11. Theme, light and dark, colours, motion

- [ ] Two themes, light and dark; dark by default. `toolkits/ui-toolkit/src/components/blocks/theme/model.ts`
- [ ] Changed by Settings' Flip or `t`; shows at once everywhere. `client/screens/places/settings/settings.tsx`, `client/screens/shell/globals.tsx`
- [ ] Web keeps it in a cookie shared across `*.kishore.app` / `*.kishore.computer` and follows other tabs. **n/a native: stored on the device.** `client/state/settings/theme.ts`
- [ ] Only ui-toolkit tokens (foreground, muted-foreground, border, accent, primary, muted, destructive, popover); no palette colours or raw values (`lint:colors`). `apps/kstack/DESIGN.md`, `apps/kstack/scripts/colors.ts`
- [ ] Money in has a `+`, out a `−`, neither coloured; `destructive` only for trouble (over Budget, negative left, Delete). `client/screens/parts/amount.tsx`, `apps/kstack/DESIGN.md`
- [ ] Digits in tabular figures. `client/screens/parts/amount.tsx`
- [ ] Money formatted with the narrow currency symbol, two decimals; compact (`$1.2K`) in stats and Budgets. `shared/ledger/money.ts`
- [ ] Months and days in the device's locale ("October 2026", "Mon, Oct 5"). `shared/ledger/month.ts`
- [ ] Categories told apart by icon and name, never hue; fixed Category and Account icon sets, a circle when unknown. `client/screens/parts/icons.tsx`
- [ ] Pills: one filled (`primary`), others bordered; a row scrolls sideways when it does not fit. `client/screens/parts/choice.tsx`
- [ ] Inter font. `entry/web/styles.css`
- [ ] Motion under 200 ms, `cubic-bezier(0.23, 1, 0.32, 1)`, transform and opacity only; a tap needs no feedback; reduced motion respected everywhere it moves. `apps/kstack/DESIGN.md`
- [ ] Inset focus ring. **n/a native (no keyboard focus).** `entry/web/styles.css`
- [ ] Hints follow the device, not the width: keyboard hints only with a keyboard and Keys on, gesture hints only on touch with the Thumb Lock on. **native: touch only, so no key hints anywhere.** `client/kit/input/device.ts`, `entry/web/styles.css`

## 12. Settings options (every one)

Device Settings, one per device, the same for every User. `client/domain/settings/settings.ts`

- [ ] `sound` (default on): every sound — Commands, Thumb Lock, swiping a row. `client/domain/settings/settings.ts`
- [ ] `keys` (default none): own Bindings by Action id. **n/a native.** same
- [ ] `keysOn` (default on): Keys switch. **n/a native.** same
- [ ] `gesturesOn` (default on): the Thumb Lock switch. same
- [ ] `backend` (default `remote`). same
- [ ] Old saved Settings still read (v1 `gestureSounds`, v2 `switching` dropped). **n/a native: no old installs; keep the schema shared.** same
- [ ] **native differs:** a Gesture Haptics setting, default on (spec, client-domain layer).
- [ ] Not a Setting but kept per device: the theme. `client/state/settings/theme.ts`
- [ ] Per User, synced with their money: currency. `shared/ledger/schemas.ts` (`Preferences`)
- [ ] Settings change shows at once; web tabs read each other's every 2 s. **n/a native: one process.** `client/state/settings/store.ts`

## 13. Offline, online, sync, copies of each User

- [ ] Each User's money is a copy on the device kept in step with the Backend; every write shows at once and rolls back if refused. `client/state/session/session.ts`, `client/state/session/use-session.tsx`
- [ ] The copy asks for other devices' changes every 10 s. `client/state/session/session.ts` (`POLL`)
- [ ] Who is signed in is asked again every 60 s, when the app comes back to the front, and when the network returns. `client/domain/machine/machine.ts` (`RECHECK`), `client/gate/gate.ts` (`boot`)
- [ ] A recheck that finds a fresh token signs the Session's next calls with it; one that finds a different User opens them. `client/domain/machine/machine.ts` (`verifying`)
- [ ] Remote: the copy lives on the device (IndexedDB on web, SQLite on native), so Ledger opens offline. `client/backends/remote/remote.ts`
- [ ] Remote, offline: the User last opened here opens from their copy, with no token until the next check. `client/domain/machine/check.ts`, `client/backends/remote/remote.ts` (`LAST_USER`)
- [ ] Remote: on every check, copies of Users no longer signed in are deleted (including old `ledger-` copies); failures only log. `client/state/local-copies/local-copies.ts`, `client/backends/remote/remote.ts`
- [ ] Offline, these are disabled: Add (header, +, `c`), Welcome's start buttons, Load sample money, Delete everything, the Account sheet's submit, Add user, Sign out, Sign out everyone. `client/screens/shell/*`, `client/screens/places/*`, `client/screens/sheets/accounts/account-sheet.tsx`
- [ ] Offline, editing an open Entry and swipe-delete still write to the copy (no online gate). `client/screens/places/entries/*`
- [ ] Online/offline follows the device's network state live. `client/state/session/use-session.tsx` (`useOnline`)
- [ ] Each User sees only their own money; a User's copy name is per User id. `client/state/local-copies/local-copies.ts` (`copyName`)

## 14. Empty states and errors

- [ ] Home, no Accounts: Welcome. `client/screens/places/home/home.tsx`
- [ ] Home, no Budgets: Budgets section hidden; no Entries: Latest empty. `client/screens/places/home/home.tsx`
- [ ] Entries: "No entries here yet." `client/screens/places/entries/list.tsx`
- [ ] Entries wide, none open: "Open an entry". `client/screens/places/entries/entries.tsx`
- [ ] Entry gone: "This entry is gone." `client/screens/places/entries/entry.tsx`
- [ ] Months: "Months show up once there are entries." `client/screens/places/months/months.tsx`
- [ ] A Month: "Nothing went out this month." `client/screens/places/months/month.tsx`
- [ ] Sidebar, no Accounts: "Add an account". `client/screens/shell/sidebar.tsx`
- [ ] Palette: "No command by that name here." **n/a native.** `client/screens/sheets/palette/palette.tsx`
- [ ] Sign-in errors and unreachable (section 3). `client/screens/shell/signed-out.tsx`
- [ ] Add User error toast (section 3). `client/screens/shell/user-switcher.tsx`
- [ ] Nothing renders on lists until the first read of the copy is done (no flash of empty states). `client/state/session/use-session.tsx` (`ready`)
- [ ] Server refusals come back as `not-found` or `storage-error` and roll the write back. `server/domain/ledger/ledger.ts`, `shared/ledger-api/ledger-api.ts`

## 15. Anything else visible

- [ ] Delete toasts carry Undo, which restores the Entry as it was. `client/screens/places/entries/list.tsx`, `client/screens/places/entries/entry.tsx`
- [ ] Accounts listed Cash, Card, Bank, Savings, then by name; Categories out before in, then by name. `client/state/session/use-session.tsx` (`useMoney`)
- [ ] An Account's balance is every Entry of it, in minus out. `shared/ledger/sums.ts` (`balances`)
- [ ] Amount typing accepts up to nine whole digits and two decimals; anything else is 0. `shared/ledger/money.ts` (`centsOf`)
- [ ] Inputs that type money use the decimal keypad; touch targets at least 44px (rows `min-h-11`). `client/screens/sheets/add/add.tsx`, `client/screens/places/settings/rows.tsx`
- [ ] Setting rows: label, optional hint under it, control at the right; Flip buttons show the chosen value and change to the other on tap. `client/screens/places/settings/rows.tsx`
- [ ] The page never rubber-bands; only the page scrolls inside the shell. **native: equivalent overscroll behaviour.** `entry/web/styles.css`
- [ ] Safe areas respected at top (header, picker) and bottom (+, Key Bar, Add sheet). `client/screens/shell/frame.tsx`, `client/kit/thumb-picker/menu.tsx`
- [ ] Back navigation: Entry back and Month back push the list; Next/Previous and Month turns replace. Native's system back must land on the same list. `client/screens/places/entries/entry.tsx`, `client/screens/places/months/month.tsx`

## Web baseline (2026-10-07, HEAD `fdd69585`)

Run from the repo root in this worktree.

- First run in the fresh worktree, before workspace packages were built: `pnpm --filter kstack test` **failed to start** (vite config could not load `@kstackz/pwa-toolkit/dist/vite`); `pnpm --filter kstack lint` **failed** at `tsc` with 197 errors, all from unbuilt `@kstackz/*` packages (`TS2307 Cannot find module` and the type errors that follow).
- After `pnpm --filter "kstack^..." build` (builds dependencies only, no source changed):
  - `pnpm --filter kstack test`: **9 test files passed, 56 tests passed, 0 failed.**
  - `pnpm --filter kstack lint`: **passed** — `tsc --noEmit` 0 errors; `laymos lint` no layer or Module violations (34 Modules, 1 Module Graph); `lint:colors` "Only theme colours".
