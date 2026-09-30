# kstack

Showcases of the app layouts and behaviours kstack supports, each a complete app.

## Language

**Showcase**:
One way an app can be laid out or behave, such as the App Shell or gestures, built as a complete, production-quality app under its own route. Everything it needs lives in its own folder; Showcases share nothing but the theme, the way their Tweaks are shown, and the way their code is shown.
_Avoid_: example, variant, demo, sample, preset

**Feature**:
One end-to-end app in the Features Showcase where several gestures meet on one screen, such as a mail inbox with swipeable rows, pull to refresh and two Sidebars. Where the Gestures Showcase shows one capability at a time, a Feature shows them working together; its Scenarios are listed as things to try in it.
_Avoid_: app, demo, integration

**Topic**:
One page of a Showcase, reached from its Sidebar, that gathers the Scenarios of one idea, such as pull to refresh.
_Avoid_: section, category, chapter

**Scenario**:
One situation a Topic shows, told in a single sentence — given this, try that — above a live demo of it, with its code a tap away. A Scenario that needs the whole screen opens full screen from its card.
_Avoid_: example, demo, case, story

**App Shell**:
The frame of an app: the status bar, a header, the area that shows the current page, and optionally a Sidebar; an app turns each part on or off. One App Shell frames every kstack app, and the App Shell Showcase shows its shapes. Not pwa-toolkit's App Shell, which is the HTML an app boots from offline.
_Avoid_: layout, frame, chrome

**Sidebar**:
The panel of an App Shell that lists where you can go, top to bottom: the app, and the way back to every Showcase; the places to go, in labelled groups; and the Account Menu. On a wide screen it sits beside the page; on a phone the page moves aside, shrinks and dims to show it, and the status bar takes its color.
_Avoid_: drawer, menu, nav panel

**Account Menu**:
Who is signed in, and everything that belongs to them: signing in and out, and the theme. At the foot of the Sidebar when there is one, at the top right of the header when there is not; never both.
_Avoid_: user menu, profile menu, settings menu

**Tweak**:
A setting a Showcase lets you change while you use it, such as whether its App Shell has a header, so one Scenario shows its variations instead of one Scenario for each. Its panel stays open while you use the Example, so each change shows as you make it. Each starts at the Showcase's default and is remembered in the browser until changed or reset.
_Avoid_: option, config, variant
