# Use adaptive Tool workspaces

DevTools keeps its resizable multi-panel workspaces at widths of 768px and
above, but switches to a single-pane drill-down flow below 768px. Compact
screens use a contextual top bar, persistent Lotel and Laymos navigation at the
bottom, browser Back for moving up the drill-down stack, bottom sheets for
lightweight controls, and full-screen pages for substantial content. This keeps
every Tool capability available without compressing the desktop layout into a
phone-sized viewport.

Major selections such as a Trace, Layer, Module, or Story belong in the URL and
browser history; temporary controls do not. Graph canvases keep the full compact
viewport and show a selected node first in an expandable summary sheet. Dense
filters and graph selectors live in labelled sheets whose trigger exposes the
active selection or filter count. The existing desktop composition remains
unchanged apart from shared responsive behavior and canvas interaction fixes.

Every action has an explicit touch-accessible path: right-click and hover may
remain desktop shortcuts, but actions also appear in detail sheets or overflow
menus, and tapping creates the same durable selection that desktop hover can
preview. Crossing the compact breakpoint preserves the active Tool, Project,
view, and selected entity while changing only their presentation.
