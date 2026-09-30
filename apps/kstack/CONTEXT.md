# kstack

Examples of the app layouts and behaviours kstack supports, each a complete app.

## Language

**Example**:
One way an app can be laid out or behave, such as a sidebar that pushes the page aside, built as a complete, production-quality app under its own route. Everything it needs lives in its own folder; Examples share nothing but the theme and the way their Tweaks are shown.
_Avoid_: variant, demo, sample, preset

**App Shell**:
The frame of an app: the status bar, a header, the area that shows the current page, and optionally a Sidebar; an app turns each part on or off. One App Shell frames every kstack app, and the App Shell Example shows its shapes. Not pwa-toolkit's App Shell, which is the HTML an app boots from offline.
_Avoid_: layout, frame, chrome

**Sidebar**:
The panel of an App Shell that lists where you can go, top to bottom: the app, and the way back to every Example; the places to go, in labelled groups; and the Account Menu. On a wide screen it sits beside the page; on a phone the page moves aside, shrinks and dims to show it, and the status bar takes its color.
_Avoid_: drawer, menu, nav panel

**Account Menu**:
Who is signed in, and everything that belongs to them: signing in and out, and the theme. At the foot of the Sidebar when there is one, at the top right of the header when there is not; never both.
_Avoid_: user menu, profile menu, settings menu

**Tweak**:
A setting an Example lets you change while you use it, such as whether its App Shell has a header, so one Example shows its variations instead of one Example for each. Its panel stays open while you use the Example, so each change shows as you make it. Each starts at the Example's default and is remembered in the browser until changed or reset.
_Avoid_: option, config, variant
