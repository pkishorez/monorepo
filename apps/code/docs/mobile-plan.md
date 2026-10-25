# Code on touch: plan

Decided in a design session on 2026-10-24. Rules every step follows are in
[platforms/web-platform/docs/touch.md](../../../platforms/web-platform/docs/touch.md);
words are in [CONTEXT.md](../CONTEXT.md) (Picker Mode, Draft, Composer, Vim Mode)
and [web-platform's CONTEXT.md](../../../platforms/web-platform/CONTEXT.md)
(Sidebar Mode). Desktop behaviour does not change except where a shared piece
changes under it.

All five steps ship together in one PR, each step its own commits.

## 1. Input decides behaviour

- Frame: rename `phone: 'drawer' | 'page'` to `sidebarMode: 'slide' | 'fullscreen'`
  across web-platform and every app using it. Code keeps `fullscreen`: the
  Sidebar is a full page with the Project Picker's `+` button at its bottom right.
- Vim Mode and the keys' status line turn off when `useDevice().keyboard` is
  false, not by width (`apps/code/src/shell/keyboard.tsx` uses `useIsMobile`).
- No auto-focus on touch: the Picker's search Focus Spot (`ui/picker/list.tsx`)
  and anything else that focuses a field on open must not, on a device with no
  keyboard. A Picker may opt in.

## 2. Picker Mode

- Web-platform: a Drawer (base-ui `ui/components/drawer.tsx`, swipe down to
  close) and a top Dialog with no animation, as generic pieces knowing nothing
  of Pickers. First as a Cosmos fixture playground, to try on an iPhone and an
  Android phone before any Picker uses them.
- Code: `Picker.Frame` becomes one deep module that draws popover, fuzzy list,
  Drawer or Dialog from how the Picker was opened, whether there is a keyboard,
  and the Picker Mode its opener chose. Width no longer decides.
- Dialog focus: a tap outside with search focused blurs; a tap outside with
  nothing focused closes. Opt-in focus happens after the Dialog is on screen,
  and the Dialog never animates.
- Modes: Drawer for Session Actions, effort and permissions, the Microphone
  Picker; Dialog for the Project Picker, folders, models and agents, the
  Session Switcher, Skills.

## 3. The Draft on touch

- Read-only at rest, two lines tall whatever its length, with an expand /
  minimise toggle. Tapping the text does nothing.
- An edit button makes it the Composer: it grows and focuses. Leaving focus
  makes it the Draft again. Empty, the text and edit button are one wide
  "Write a message…" pill.
- The microphone is the centre and largest button of the row under it; the
  Skill button is the next largest. Also there: `+` (a Drawer: attach file,
  photo, Microphone), a model chip ("Opus · High · Ask") and Send once there is
  text. Clean and minimal: few buttons, large, quiet styling.
- The model chip opens a Drawer: "Agent ›" and "Model ›" open the Dialog;
  effort as a row of options, permissions as a short list, changed in place.
  This replaces the settings button and its bar.
- A Dictation scrolls the Draft to where its text goes, shows "Transcribing…"
  there, then replaces it with the text, animated. Text added while not
  editing goes at the cursor from the last edit, else at the end.

## 4. Header and Sidebar

- Header on a phone: back, title, offline mark, and one `⋯` that opens Session
  Actions as a Drawer. The Session Switcher button goes (the Sidebar page is
  the list); the Microphone Picker moves into the Draft's `+` Drawer.
- Swipe a Session row left to right to Settle; a Settled row to un-Settle.
  Use web-platform's `recipes/swipe-row`, `motion/react` springs, Undo toast.
- Pull to Reload at the top of the Sidebar (`usePullToRefresh`).
- A design pass on the Sidebar page and header with the emil-design-foundations
  skill.

## 5. Installing

- Manifest `short_name: 'Code'` and `apple-mobile-web-app-title`.
- iOS splash screens (`pwa/prompts/splash`): the Code logo at the top,
  "Powered by kestack" at the bottom. They need `apple-mobile-web-app-capable`,
  which `pwa/prompts/status/head.ts` leaves out for the status bar on theme
  switch; `splash.ts` says the Status Bar Surface covers it. Turn it on. A
  theme switch on an installed iPhone app needs a device: it is checked on
  one before merge, and the result recorded in the PR.
- Manifest screenshots, so Android shows its richer install sheet.

## 6. The Touch Draft, and Pickers by how they were opened

Decided on 2026-10-25, after trying step 3 on a phone. It replaces step 3's
row of buttons; keep only what has a place.

- Pickers follow the input that opened them, not the device: keys → the
  fuzzy list in the middle, search focused; mouse → next to its button;
  touch (`pointerType === 'touch'`) → its Picker Mode, nothing focused.
  The screen dims behind every Picker, desktop included. Vim Mode and which
  Draft is drawn still follow the device.
- No focus rings or highlighted borders on touch, the Draft's card included.
- The Touch Draft is its own actor, separate from the desktop Draft. Its
  States: Resting, Recording, Transcribing (to take, or to take and send),
  Editing, Sending. The Draft's text is its Model, not a State; whether it
  is expanded is the View's. It drives the one Dictation actor: start, take,
  cancel. Each State is drawn with `motion/react` transitions, none while a
  field has focus.
- One main button, bottom right: the microphone (Lucide `Mic`).
  - Resting, empty: only the microphone.
  - Resting, with text: a small Send (`ArrowUp`) appears above it; swipe the
    microphone up onto it, or tap it, to send. No double tap.
  - Recording: the microphone becomes take (`Check`); tap to take the text,
    swipe up to take and send once transcribed; a small cancel (`X`) on the
    left throws it away. If it cannot be transcribed, nothing is sent and
    the Dictation's Retry shows.
  - Android buzzes as the swipe crosses into send; iOS cannot.
- Left of it: the Draft's text in a few lines (the card as tall as the
  microphone's column), edit (`Pencil`), then the model chip, Skills
  (`SquareSlash`) and Quick actions (`Zap`).
- Quick actions: a Drawer, each row an icon, its action and one line:
  Ask on the side, Paste (reads the clipboard on tap; iOS shows its own
  Paste bubble), Attach a file, Photo, and the Microphone Picker.
- Edit makes the whole card the Composer above the keyboard, with Done;
  sending from it closes it.
- Desktop: unchanged but for the dimmed screen behind its Pickers.

## 7. The Touch Draft as a bar

Decided on 2026-10-26, after trying two layouts side by side on a phone.
It replaces step 6's main button; Quick actions stay as they were.

- A sheet at the page's foot, edge to edge; in a Drawer, flat, the Drawer
  the sheet. The model chip and Text | Voice on top, folded away while
  editing; the words; then a row that never moves.
- Text or voice, kept in Device State, voice by default. A Swipe on the
  words switches: left to voice, right to text; from text, right opens the
  sidebar. While no Machine can transcribe it is text, and asking for
  voice shakes the words and says why, with a link to Settings.
- In voice a tap on the words places the caret, no keyboard; in text it
  makes the Draft the Composer. An empty Draft's placeholder edits it.
- The row: two round slots on the left (Skills and Quick actions; Cancel
  and the microphone while recording; Discard once failed; Done while
  editing), the talk bar in the middle in voice (Tap to talk, Listening,
  Transcribing, Try again), Send on the right, which while recording stops
  and sends once it is text. Each slot cross-fades in place.
