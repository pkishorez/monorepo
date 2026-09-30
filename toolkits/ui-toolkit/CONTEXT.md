# Frontend — Ubiquitous Language

Reusable user-interface blocks and presentation components shared by applications in the monorepo.

## Language

**Theme**:
The shared light or dark appearance used by KUI-based applications. The preference is stored in a user-readable cookie shared by sibling application hosts; without that cookie, the Theme is dark.
_Avoid_: color mode, system theme

**Status Bar Surface**:
The opaque strip at the top edge of an app that nothing covers, in the Theme's background or in the color of whatever the app shows up there, such as a sidebar behind a page moved aside. An installed iOS web app colors its status bar from it rather than from the declared theme color, so it is what makes the status bar follow a Theme switch.
_Avoid_: header background, notch fill
