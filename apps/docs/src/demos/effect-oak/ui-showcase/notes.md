# UI showcase

Status: partial. Nine kinds of component, each a reusable Actor factory with
its own View, all working with mouse and keyboard, and Time Travel replays
every one. Partial because every component is uncontrolled: a parent can
hear what was picked but cannot open, set or clear a component (blockers 13
and 14). Eighteen of Foldkit's 27 components are skipped (listed below).

## What was ported

Foldkit's `ui-showcase`, its largest example: one page per `@foldkit/ui`
component, about 60 component instances, each a Submodel nested in one big
`UiModel`, with a `Got*Message` wrapper and an `Update.foldChild` per
instance.

The question for this batch: what does a stateful UI component look like
as an Effect Oak Actor? The answer here is a **factory**: `makeMenu(options)`
returns `{ Menu, MenuView }`, one Actor and its View. The options fix
everything a parent would pass as props elsewhere (ids, labels, options,
panels), because a parent cannot hand a Child anything at run time.

### Tree

```
UiShowcase (root)        Model { page, heard, toasts, nextToastId }
                         Provides Picks (Request: report(source, value))
                         Picked → heard[source] = value (+ a toast for dialogs and the menu)
                         ClickedShowToast → push, expireLater(id) Command
├─ dialog: Dialog(dialog)             { open }  focus Commands, reports the action
├─ settings: Dialog(settings)         { open }
│  └─ inner: Dialog(confirm-delete)   { open }  nested: a Child of the outer dialog
├─ menu: Menu(menu)                   { open, active, typed }  typeahead clear Command
├─ tabsHorizontal: Tabs(...)          { selected }  roving tabindex, focus Command
├─ tabsVertical: Tabs(...)            { selected }
├─ listbox: Listbox(listbox)          { open, active, selected[] }
├─ listboxMulti: Listbox(...)         multiple, starts from `initial`
├─ combobox: Combobox(combobox)       { open, query, active, selected }
├─ disclosure, disclosurePreview      { open }  reports nothing
├─ notifications: Switch(...)         { on }  the kit's Switch, controlled
└─ tooltip, tooltipNoDelay            { shown }  hover delay as a replaced Command

picks/        Picks, the Request every component reports through
focus/        focus Commands, Tab trapping, Arrow/Home/End stepping
dialog/       makeDialog, makeNestedDialog, the shared DialogFrame drawing
menu/ tabs/ listbox/ combobox/ disclosure/ switch/ tooltip/   one factory each
toasts/       the Toast Schema, expiry Command, ToastStack drawing
components.tsx   every instance, made once
pages.ts      the pages, and which reports each shows
section.tsx   a demo section, and "What the parent heard"
```

Every component is a Child for the whole app. The page is Model data and
the View draws only that page's Children, so a choice made on one page is
still there when you come back (blocker 10, as in job-application).

### Chosen components and skipped ones

Built: Dialog (basic and nested), Menu, Tabs (horizontal and vertical),
Listbox (single and multiple), Combobox, Disclosure (basic and collapsed
preview), Switch, Tooltip (with and without delay), Toast. Each shows a
different shape: focus in and out (Dialog), a popup list with focus
(Menu, Listbox), a popup list without focus (Combobox), roving focus (Tabs),
a timer in the app's Time (Tooltip, Menu typeahead, Toast), a list as Model
data (Toast), nesting (Dialog), and a kit component kept controlled
(Switch).

Skipped:

- **Button, Input, Textarea, Fieldset, Select, Checkbox, Meter, Progress:**
  stateless or a plain controlled input; the form demo already has these.
- **RadioGroup:** the same roving focus as Tabs.
- **Popover, HoverIntent, mobile menu Dialog:** a Menu without items, the
  Tooltip's delay, and a Dialog.
- **Calendar, DatePicker:** a grid with the same keyboard stepping as Tabs,
  but large, and they need today's date as a flag (blocker 3).
- **Slider, DragAndDrop, FileDrop:** pointer following and dropping, done in
  kanban and job-application.
- **Animation:** enter and leave phases; the Disclosure animates with CSS.
- **VirtualList:** scroll position and measured row heights are DOM state
  outside the Actors, nothing about Actors to learn.
- **Routing:** pages are Model data, not URLs (blocker 15 has the details).

## How reusable components fit

- **A component is a factory, not an Actor.** Options are fixed when the
  factory runs, so each use is its own Actor definition, named
  `Menu(menu)`. That is fine for a showcase, and it is how form and kanban
  already did it, but it means nothing can change a component's options at
  run time: the Tabs' panels, the listbox's options and the dialog's text
  are all fixed (blocker 13). A list of options from the server would need
  a Request down, which does not exist (blocker 14).
- **Reporting a selection up is a Request,** and it fits well. Each
  component Requires `Picks` and returns `reportPick(id, value)` as a
  Command. The parent Provides it and keeps a copy. A nested dialog's
  report goes straight to the root: Picks passes through the outer dialog,
  which Requires it too. Foldkit's OutMessage is the same idea, but folded
  synchronously in the parent's Update; here it is a second Message, a
  Command later.
- **Controlled versus uncontrolled: only uncontrolled.** A component owns
  its value and starts from the factory's `initial` (blocker 3). The parent
  cannot open a dialog (so each Dialog draws its own trigger), cannot clear
  a combobox, and cannot set the selected tab: there is no way to send a
  Child a Message (blocker 14) or give it data (blocker 13). Foldkit's
  showcase does all of these: `Dialog.open(model)` from a parent's button,
  `ClickedDeleteProject` opening the nested dialog. A controlled component
  would need the parent's value as a View input, plus a `tell` to the
  Child.
- **Focus management is Commands,** as in Foldkit: `focusId` and
  `focusFirstIn` wait one animation frame and call `focus()`. Replay drops
  Commands, so stepping never steals focus from the timeline. Writing them
  as View effects would have done that. What needs care is where focus is
  NOT moved: a click already focused its target, and the Combobox keeps
  focus in its input and moves `aria-activedescendant` instead.
- **Open is Model data, never a State.** Every component here would read
  well as `Closed | Open { active }`, but each State is drawn by its own
  keyed component (blocker 11): a Transition remounts the trigger, the
  focused button disappears, and focus cannot return to it. So all nine use
  a boolean. States would also give Lifetimes for document listeners
  (Escape, clicks outside), but those are done with React handlers in the
  View instead: `onBlur` with `relatedTarget` for clicking outside.
- **Keyboard handling is all in Update.** The View sends
  `PressedKey { key }`; Update steps the active item, opens, chooses or
  closes. Every key is a Message in the Log, so Replay shows the active
  item moving. The View only decides which keys to `preventDefault`.
- **Portals are not needed, and the top layer gets in the way.** Popups are
  absolutely positioned in a relative wrapper. Dialogs cover the demo with
  an absolute overlay instead of `showModal()`: the top layer makes the
  rest of the page inert, and Time Travel draws past Views, so stepping to
  a moment the dialog was open would have locked the Shell's timeline. The
  panel traps Tab itself. A React portal would work in a View (Views are
  React), but would draw over the Shell during Replay too.
- **Timers belong to the component.** The Tooltip's hover delay and the
  Menu's typeahead reset are keyed Commands (`command: { key, run }`): the
  next one under the same key replaces it, and the tooltip's `Left` cancels
  it (`cancel: 'wait'`). They belong to the Instance, so they stop with it.

## Deviations

- **No animations** besides the Disclosure's CSS height and the tooltip's
  and dialogs' instant show. Foldkit's Animation Submodel has enter and
  leave phases as Messages.
- **No scroll lock or `inert` on the page behind a dialog.** It covers the
  demo, not the page.
- **Dialog and menu choices also become toasts**, to show a parent acting on
  a report. Foldkit's toast page has only its own buttons.
- **Toasts do not pause on hover**, and dismissing one early leaves its
  expiry Command running (blocker 7); the expiry of a toast that is gone is
  ignored.
- **One page per component kind, not per variant.** Foldkit has five
  combobox variants, three listbox variants, two menus and two popovers.

## Blockers

- **21 (new): an Actor factory cannot be generic over a Child.** The first
  `makeDialog(options, inner?)` took the nested dialog's Actor as a type
  parameter. It does not compile: the `Actor` type is not exported, so the
  inner Actor cannot be constrained to "needs only Picks", and `make`'s
  check that a Child fits (`Fits`) cannot be proven for a type parameter.
  The fix here is a second factory, `makeNestedDialog`, which makes its
  inner dialog itself, so every type is concrete. A reusable container
  (a dialog with any body, a tab panel holding any Actor) needs an exported
  `Actor.Needing<Picks>` type (an Actor whose Requires are covered by these
  Capabilities) that `children` accepts without re-checking.
- **14, no parent → Child Messages.** No component can be opened, set or
  cleared from outside, so each draws its own trigger.
- **13, no data from parent to Child.** Options, panels and labels are fixed
  in the factory; the parent cannot pass the current value in.
- **11, each State drawn by its own keyed component.** Open and closed are
  Model data in every component, not States.
- **3, no init input.** The multiple listbox's starting reviewers are a
  factory option.
- **10, Children belong to one State.** Pages are Model data, so components
  keep their choices across pages.
- **1, no list of Children.** (now possible with `Actor.many` and `invoke`; this demo still keeps the list as data) Toasts are data in the root.
- **7, no way to stop one Command.** Keyed Commands can now be cancelled,
  but a dismissed toast's expiry is still left to run and be ignored.

## Testing

Foldkit tests the showcase with 6 `story` tests (routes parse to the right
page; changing the URL closes the mobile menu, resolving
`Dialog.CloseDialog` with `Command.resolve`) and 7 `scene` tests (the nav
lists the components, the home heading, simple routes draw, the Hover
Intent trigger exists, the Disclosure panel stays mounted while closed, the
collapsed preview's Read more turns into Show less, the 404 page). The
components themselves are tested in `@foldkit/ui`: 48 test files of
stories that open a menu and resolve `FocusItems`, choose an item and
expect `FocusButton` and a `Selected` OutMessage, and so on.

What Effect Oak would need to test the same:

- **Named Commands** (blocker 4): "Escape closes the menu and asks to focus
  the button" is `focusId('menu-button')`, an anonymous Effect, and a
  report is `reportPick(...)`, another. `Command.expectHas(FocusButton)`
  needs names.
- **One Update on a given Model** (blocker 5): every component's keyboard
  rules are pure and would port as stories directly.
- **A View drawn from a given Model** (blocker 5) for the scenes. The
  Disclosure test ("Read more" becomes "Show less") is a click and a
  redraw.
- **A Request seen in a test**: the Picks report is a Command, so testing
  "choosing reports up" needs the same names as above, or a
  `Runtime.start` with a stub Picks today.

## Also surprising

- **The Shell's Space shortcut took Space from the components.** The Shell
  switches Live and Replay on Space anywhere except text fields, so Space
  on a listbox option or the Switch went to Replay instead, and the past
  View is `inert`, which then dropped focus to the body. The Shell now
  skips a Space the app already handled (`event.defaultPrevented`). A
  focused plain button still loses Space to the Shell.
- **Reading a Child's Model is one call away.** A View's `children.x` is a
  Handle with `current()`, so a parent View could read a Child's Model. It
  is not reactive (the parent does not re-render when the Child changes)
  and it is not a documented use, so the showcase keeps its copy through
  Picks.
- **None of the shared modules fit.** `location/` could route the pages,
  but Model data keeps every component's state across pages for free.
- **Nesting fits, but less than it could.** The nested dialog is a Child of
  the outer one, Requires nothing new, and Escape stops at the inner panel.
  But since open is Model data (blocker 11), the inner dialog lives as long
  as the outer Actor, not as long as the outer dialog is open. With an
  `Open` State holding the inner dialog as its Child, closing the outer one
  would destroy the inner one for free; here the inner overlay covering
  the outer one is what keeps them in step.
