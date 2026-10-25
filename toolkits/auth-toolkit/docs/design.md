# Auth Worker pages: design guidelines

The Auth Worker's pages (`src/worker/app`) are a quiet, ink-on-paper product
surface: one column, one next step, the brand's accent on that step and
nowhere else. Everything below traces to a file in `src/worker/app/ui` or
`src/worker/app/actor-app`; a variant, token or size not listed here does not
exist. Adding one means adding it to the code and to this file together.

## Tokens

Defined in `styles.css`. Every colour is `light-dark(light, dark)`, so the
Theme is one `color-scheme` on the root. Use the Tailwind utility for the
token (`bg-surface`, `text-muted-fg`); never a raw hex, an `oklch()`, a
palette class (`gray-200`) or a `dark:` variant. A `dark:` override breaks the
Theme: it follows the system, not the visitor's choice.

| What            | Token                                               | Use                                                                                       |
| --------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Page background | `page`                                              | `body` only                                                                               |
| Raised surface  | `surface`                                           | Cards, popup, dialog, inputs, secondary buttons                                           |
| Text            | `fg`                                                | Titles, body, row titles                                                                  |
| Secondary text  | `muted-fg`                                          | Leads, details, captions, group labels                                                    |
| Tertiary text   | `faint`                                             | Fine print, dates after a detail, disabled labels                                         |
| Quiet fill      | `muted`                                             | Icon tiles, skeletons, the code box, the menu's Active band                               |
| Hover fill      | `hover`                                             | Hover on rows, ghost buttons, menu rows                                                   |
| Hairline        | `line`                                              | Dividers, 1px rings                                                                       |
| The next step   | `accent`, `accent-fg`, `accent-hover`               | Primary button, brand mark, picked Account. Nothing else.                                 |
| Focus           | `ring`                                              | Focus outline only; ink, never the brand                                                  |
| States          | `danger(-soft)`, `warning(-soft)`, `success(-soft)` | Notices, status tiles, the "using it now" dot, consent checks, "Sign out of all accounts" |
| Backdrop        | `scrim`                                             | Dialog backdrop                                                                           |

Depth uses shadow tokens, through `shadow-(--token)`: `--shadow-raised`
(Card), `--shadow-control` (secondary button), `--shadow-overlay`
(popup, dialog), `--shadow-edge` (avatar picture edge). In dark each collapses
to its 1px ring. Separation (row dividers, input edge) stays a `line`
border or ring, never a shadow.

Type: system UI font, `font-mono` for codes and paths only. Sizes are fixed:
26px task title, 24px (`text-2xl`) Home title, 17px section title, 15px body
and buttons, 14px (`text-sm`) details and captions, 12px (`text-xs`) the menu
caption only. Inputs are 16px so iOS doesn't zoom. Weights: 400, 500
(`font-medium`), 600 (`font-semibold`, titles only).

Radii nest: 16px Card (`rounded-2xl`), 12px tiles, picker rows, popup and
dialog (`rounded-xl`), 8px buttons and inputs (`rounded-lg`), 6px rows inside
the popup (`rounded-md`, 12 − 6 padding).

## Page templates

Every page is drawn in `Frame` (`actor-app/frame/frame.tsx`). Never build a page
without it: the header and column are what make the pages one product.

- **Header**: 64px, 640px wide. Product name left (links to `/`); right,
  8px apart, the 44px Theme toggle on every page, then, signed in, the 44px
  Account menu (its slot held empty while the Accounts load). Nothing else
  ever goes in the header.
- **Column**: top-aligned, starting 32px (56px from `sm`) under the header on
  every page. Nothing is vertically centred: a centred page and a top-aligned
  page next to each other read as two products.
- There is no footer.

```
Which layout?
 ├── Lists what the Account has and lets them manage it (Home) → layout="account" (640px)
 └── One task or one outcome (sign in, approve, allow, an error, 404) → layout="task" (400px)
```

A **task page** reads top to bottom, always in this order: `TaskHeading`
(44px mark, title, one line of why), then 32px (`mt-8`), the content blocks
(code box, scopes, picker, input) 24px apart, then the actions, then fine
print in `text-sm text-faint`. The mark is an icon in a tile:
`neutral` for the task itself (LogIn, UserPlus, MonitorSmartphone,
FileQuestion), `success` for done, `warning` for "can't go on"; the Consent
Screen's mark is the `ClientMark`, `tone="none"`. The header already shows
the product, so a task mark never repeats the brand.

The **account page** opens with the Account (lg avatar, name as `h1`, email),
then `Section`s 40px apart: 17px title, a one-line lead, then `Group`s. A
`Group` is a 14px `muted-fg` caption, an optional action on the right of
the caption, and its rows.

## Lists

Rows live in `Rows` (a Card with dividers). Each `Row` is 68px minimum: a
36px icon tile (or `ClientMark size="sm"`), title in `font-medium`, a detail
line in `text-sm text-muted-fg`, one ghost `sm` action on the right. Build
the detail with `Parts`, never a joined string: it breaks lines between
parts, not inside "Signed in Oct 19".

The thing the visitor is using right now is pinned first in its own Group
("This browser") and says so in words with a `success` dot ("You're using
it now"). Never mark it with a tag inside a mixed list: a tag on one of six
look-alike rows is missed. Everything else goes in the next Group, with its
count in the caption.

A Group with no rows shows `EmptyRow`: one 68px Card with one sentence that
says what would be here and how it gets here. Never "No items".

## Actions

`Button` / `LinkButton` (`ui/button.tsx`). Tones: `primary`, `secondary`,
`ghost`. Sizes: `md` (default, 44px touch / 40px pointer), `lg` (full width,
task pages), `sm` (32px look, 44px hit area; rows and group actions).
Nothing else exists.

```
Is it the one next step of the page?
 ├── Yes → tone="primary" (one per view; a dialog is its own view)
 └── No
      ├── Does it answer the request (Cancel on device/consent)? → "secondary"
      ├── Does it act on a whole group (Sign out everywhere else)? → "secondary", size="sm", in the Group caption
      └── Leaving, going back, a row's own action → "ghost"
```

On task pages, actions are `size="lg"`, stacked, primary first. Signing in
is always `GoogleButton`: Google's neutral look, never the accent, even when
it is the page's next step. Where an action is a link (`/`, `/login`), use
`LinkButton`, not a button that navigates.

```tsx
// Correct: the answer's two halves, the second still an answer
<Button tone="primary" size="lg">Approve</Button>
<Button tone="secondary" size="lg">Cancel</Button>

// Incorrect: two primaries, and a "danger" tone that doesn't exist
<Button tone="primary" size="lg">Approve</Button>
<Button tone="danger" size="lg">Cancel</Button>
```

A busy button keeps its place and width, shows the `Spinner` and says what
it is doing (`busy="Signing out…"`); the other buttons in the group
disable. Never disable a button permanently without saying why next to it.

## Destructive actions and confirmations

Nothing on these pages destroys data: a sign-out or a removed Grant is undone
by signing in or allowing again. So there is no danger tone (the Account
menu's "Sign out of all accounts" is the one item in `text-danger`), and single
removals happen at once with a toast. `ConfirmDialog` (`ui/dialog.tsx`) is
used once, for "Sign out everywhere else", because it ends several Sign-ins
the visitor can't see. A confirmation's title is the question, its
description says who is affected and what stays, cancel is `ghost` and comes
first ("Keep them"), the confirm is `primary` and says the count ("Sign out
3 others"). Don't add a second confirmation without updating this section.

## Feedback

- **Toasts** (`app-view.tsx`): the outcome of an action the visitor took,
  done or failed ("Removed access for Claude"), bottom centre, inverted,
  gone after 2.5s plus 250ms a word. Never for a failure that leaves the
  page unusable: that is a Notice.
- **Notice** (`ui/notice.tsx`): `error` (something failed; `role="alert"`)
  or `warning` (read this before going on). Icon plus words, never colour
  alone; placed directly above the control it is about, or under the input
  it explains. A retry inside a Notice is a ghost `sm` button in
  `text-danger`.
- **Loading**: a page arrives with its data, so a first visit has no
  loading state. Only a move or an Account Switch that outlasts the Router's
  150ms hold shows one: the page's single placeholder in `Unready`, never a
  skeleton per section. It is drawn line for line where the page will be:
  `Skeleton`s sized like what they stand for (68px rows, 44px tiles, 44px
  buttons) and `SkeletonText` for words, which takes the very lines the
  text will, so nothing moves when it arrives; the page then fades in once,
  through the Frame's `waited`. Spinners only inside busy buttons.
- **Errors**: say what happened and the specific way on. "Try signing in
  again" is primary when it is the fix; when the fix is elsewhere ("go back
  to the app"), the way out (`Go to your account`) is secondary.

## Account menu

`AccountMenu` (`actor-app/frame/account-menu.tsx`) is the last control at the top
right of a signed-in page, after the Theme toggle. It is a Base UI `Menu`
(`role="menu"`): arrow keys, Home/End and typing a name move through the
items, Escape closes, and focus goes back to the avatar. Top to bottom:

1. **The Active Account**, on its own `muted` band across the top of the
   popup, under a `border-b border-line`: caption "Signed in as", 32px
   avatar, name, email, and a quiet "Sign out" text item (`text-sm`,
   `muted-fg`; highlighted it lifts to `surface` with `--shadow-control`).
   It signs out this Account only. The band says who is active; there is no
   check.
2. **"Switch account"**, only when there are other Accounts: each one a
   plain 44px+ row (32px avatar, name, email). The whole row switches; there
   is no icon, no per-row sign-out, no `⋯`. To sign out of another Account,
   switch to it, then "Sign out".
3. A rule, then **"Add another account"** (a link to the Login Screen), or,
   at the limit, the sentence saying why not; then **"Sign out of all
   accounts"** in `text-danger`, the one place that token colours an action.
   It is hidden with one Account, where "Sign out" already does it.

An action keeps the menu open on its item until it is done: the row being
switched to keeps the hover fill and a `Spinner`, "Sign out" reads
"Signing out…", every other item disables; then the menu closes. Names and
emails truncate with `…` and carry the whole text in `title`. The popup is
`min(340px, 100vw − 24px)` wide, so it fits a 390px phone. New items go in
the menu, never in the header.

## Theme

Light or dark, no "System" choice. `ThemeToggle` (`actor-app/frame/theme.tsx`) is one
44px icon button in the header, before the Account menu, on every page
signed in or out; nowhere else. Its icon shows the Theme it switches to
(moon in light, sun in dark), its `aria-label` says it ("Switch to dark
theme"), and its focus is the global ring. The icon follows the root's
`data-theme` in CSS (`in-data-[theme=dark]:`), so it is right on the first
paint.

Until the visitor presses it there is no cookie, and the Document's head
script sets `data-theme` on the root from `prefers-color-scheme` before the
first paint. Pressing it writes `theme=light|dark` on the Shared Cookie
Domain, which the Auth Worker reads into every page's data for the server's
render, and sets `data-theme` at once. Switching holds every transition for
one frame so nothing fades across. Check every change in both themes.

## Copy

- Sentence case everywhere; titles are a question or an outcome ("Sign in to
  acme-cli?", "You're signed in on acme-cli").
- Buttons say the outcome: "Approve", "Remove access", "Sign out 3 others".
  Never "Submit", "OK", "Yes".
- Name things the way the visitor sees them: "Chrome on macOS", "This
  browser", "Apps with access". Never "session", "token", "client".
- Errors say what to do: "Enter the code your device shows." Never "Invalid
  input" or "Something went wrong".
- `…` for "in progress" and "taking you back", never `...`; `·` between
  detail parts.

## Motion

Only what answers "did that work?": 150ms colour/shadow on hover, press at
`scale(0.96)`, the menu popup scaling from its trigger (150ms ease-out in, 100ms out), the
dialog (200ms in, 150ms out), toasts rising 200ms. Name the properties
(`transition-[background-color,box-shadow]`), never `transition-all`.
Everything has `motion-reduce:` off; nothing animates on page load or on
keyboard navigation.

## Accessibility

- Every interactive thing is a `button`, `a`, or a native input in a
  `label`; icon-only buttons have an `aria-label` that names the Account or
  Sign-in they act on.
- Hit areas are 44px on touch: use the Button sizes or a `before:` inset.
- Focus is the ink `ring`, 2px, offset 2px; never removed, never the brand.
- Radio choices (the Approving Account) are native radios, visually
  hidden, styled through `has-[:checked]` and `has-[:focus-visible]`.
- State is never colour alone: the picked Account has a check, the Active
  Account its own band captioned "Signed in as", the current
  Sign-in has words, a Notice has an icon.
