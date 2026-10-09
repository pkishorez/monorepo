# Time is in the Message, not in Tick Messages

Anything that moves between Messages (a scrolling road, a car changing lanes) needs time. The Runtime stamps every Message with its Time, in milliseconds since it started, read from Effect's `Clock` when the Message is sent. Update gets it as `at` and records what is happening and since when: "heading for lane 1 from lane 0 since 4200". A View works out where things are at each Frame from the Model, State and the Frame's Time, through `useFrame`, and moves them through refs without a React render. Replay seeks by Time: it plays every Message sent by then, and Views draw at that Time. Frames are never Messages and are never stored.

## Considered Options

- **A Tick Message every animation frame, as in Elm**: rejected. A one-minute game is about 3,600 Messages: the Log grows without end, the timeline is unreadable, and scrubbing back replays thousands of Updates.
- **The sender puts the Time in the Message**: rejected. Every app would do it by hand, and nothing would tie the View's clock to the timeline's.
- **The Model stores positions per Frame, or a transformation on the Node computes a Frame**: rejected. How motion looks depends on what draws it (SVG, canvas, text), so the math belongs in the View; the Model says only what is happening.
- **Re-rendering React at every animation frame**: rejected. Every Frame would re-render the whole View.

## Consequences

- Time Travel is continuous: the timeline is in milliseconds, and Messages are marks on it.
- Messages sent at the same Time can only be seen together.
- A Message sent at Time 0, such as one from a Lifetime that starts with the app, is already handled at Time 0.
- Randomness that must replay goes into a Message, never into Update.
