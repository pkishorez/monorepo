# Routing a Kabuki app

The demo is a small signed-in app, Acme, that routes itself with `@kestack/kabuki/routing`, in a browser window whose address can live in memory or on TanStack Router. Each routing case is explained on the page that shows it. The routing words, Route, Routes, Router, Outlet, Navigation, Move, Redirect, Address, Adapter and Metadata, keep their @kestack/kabuki names; the words here are the demo's own.

## Language

**Case**:
One routing situation the demo shows, explained where it happens, with what to try.
_Avoid_: scenario, test, example

**Address bar**:
The window's own bar, drawn from the Router: Back, Forward, the URL, and the history as entries. In memory it is the only address; on TanStack it shows what the browser does.
_Avoid_: url bar, browser chrome, toolbar

**Switch**:
The demo's choice of Adapter, memory or TanStack: the same app drawn twice, each with its own History.
_Avoid_: mode, toggle
