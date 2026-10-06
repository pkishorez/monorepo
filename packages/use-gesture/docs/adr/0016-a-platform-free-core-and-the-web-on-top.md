# A platform-free core, and the web on top of it

Ledger is getting a native app on Expo, and its gestures should behave the same there: the same zones hearing a Gesture, the same Direction read once, the same Swipe rules, the same Thumb Picker walk. The package was written for the browser through and through: the tracker was typed on DOM `Element`, found zones with `closest`, and gave every finger Motion values. So it splits in two. The package root is now a core with no DOM, no React and no Motion: `createGestureProvider` takes a Zone Tree (how a platform's zones nest) and gives a `sink` that a Touch Source feeds plain finger samples, `{ id, x, y, t, target }`; listeners hear immutable Pointers, with a `move` as each finger moves. The Swipe's rules and the Tree Walk Ledger's Thumb Picker moved through live there too. Everything the browser needs — pointer and touch events, `touch-action`, `closest`, Native Scroll, Motion values, the React provider, zones and hooks, the Recognizers and Patterns — is `./web`, built on the core's public door the way the Expo Toolkit will be.

## Considered Options

- **A separate core package**: rejected. One version and one changelog for what is one design; a subpath costs nothing.
- **The core generic over how a finger's values are held**, so the web could keep Motion values inside the tracker: rejected. Every type would carry the parameter, and the core would still have to read numbers out of them. Plain snapshots are simpler to reason about; the web mirrors them into Motion values once per provider.
- **Leaving `./core` and `./recognizers` as web entry points**: rejected. `./web` is one door for an app in a browser; the root is for platforms.

## Consequences

- The package root is no longer what a web app imports: `GestureProvider`, `GestureZone`, `useGesture`, `useSwipe`, `useSidebar` and `usePullToRefresh` come from `@kstackz/use-gesture/web`. `motion`, `react` and `react-dom` are optional peers.
- Each change to a finger makes a new Pointer and a new map in the core, so a listener can keep what it was handed. On the web the map handed to listeners still changes only as a finger lands or lifts, and each finger keeps its Motion values for its Gesture.
- The core is held platform-free three ways: Laymos keeps it from importing `./web`, `tsconfig.core.json` compiles it with no DOM, and a test fails on any package import or browser global in it.
- The Thumb Lock itself (a still thumb beside a moving finger) is still Ledger's, in its web kit; a core recognizer for it would serve the phone too.
