# Recognizers and Patterns layer above useGesture

`useGesture` reports fingers and nothing else (ADR 0009), which lets an app express any gesture but leaves every app to rebuild the same readings: a swipe down, a sidebar that follows the finger and settles, a pull to refresh. Those readings now live in the package as two layers above the core, each depending only on the one below. A **Recognizer**, such as `useSwipe`, reads one generic meaning from a Gesture with filters on direction, finger count and where it starts. It is Possible from the first finger, Tracking once its axis locks, and ends in a Commit or a Cancel, with live values for feedback on the way. A **Pattern**, such as `useSidebar` or `usePullToRefresh`, is built from Recognizers and gives exactly the values one UI needs, settling itself when the fingers lift. An app uses a Pattern; when none fits it builds its own from Recognizers, and when those do not fit, from `useGesture`.

ADR 0009 rejected hooks like these beside a lower-level one because each needed rules against the others. These have none. Recognizers never know about each other: two that hear the same Gesture may both Commit, and the app keeps them apart with zones, `trapped` and `enabled`, as it does for `useGesture`. A Pattern that needs two Recognizers, such as a sidebar's open and close Swipes, keeps them apart the same way, with `enabled`.

The block moves out of ui-toolkit into `@kstackz/use-gesture`, with the core untouched in `src/core` and the layers beside it in `src/recognizers` and `src/patterns`. Laymos holds the direction: a lower layer never imports a higher one. There is one entry point; the layers are an internal rule, not something an app learns to import a Pattern.

## Considered Options

- **Only `useGesture`, with helpers that read Pointers** (ADR 0009's plan): rejected. The hard parts — axis lock, velocity that falls when a finger stops, deciding at release, settling — would still be each app's to repeat.
- **Recognizers as values run by one hook that decides between them**: rejected. It puts arbitration back into the package, which ADR 0009 took out, and app code reads worse than one hook per meaning.
- **The provider arbitrates between Recognizers**: rejected for the same reason; the app already has zones, `trapped` and `enabled`.
- **A separate Flick Recognizer**: rejected. A flick is a Swipe that Commits on speed alone, `commit: { velocity }`.
- **Patterns in ui-toolkit's Native block**: rejected. Patterns are touch behaviour and know nothing of where the app runs; the Native block decides when each is on, and styles it.
- **Subpath entries per layer**: rejected. An app would learn the layering just to import `useSidebar`.

## Consequences

- A Swipe decides at the first finger lifting, not the last, since a two-finger swipe is judged as its fingers lift. A finger landing after its axis locks Cancels it.
- Its velocity is measured over the last 100ms and re-read while a finger rests, so a Swipe that stops before lifting shows it would no longer Commit before the finger lifts.
- Patterns are hooks only. They return motion values and state, and the app renders them.
- A pull to refresh starts only when its list is already at the top: a scroll that reaches the top mid-touch stays the browser's until every finger lifts, as the core decides.
- A listener can claim touches that land where it listens, even over an element that could scroll them; a Swipe with `from` claims its edge. Without that, the first movement's few noisy px decided whether an edge swipe opened a sidebar or scrolled the list under it. The claim is asked only at a touch's first movement, so taps under it still click.
