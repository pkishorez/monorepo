# Effects are shaders over one snapshot of the HTML

Dune draws the whole HTML as one Snapshot and runs every Effect over it as a pure function of the pixel: what is at `uv` now, the pointer, the time, the Lamps. An Effect holds no state about elements, and the Engine never takes an element out of the page to draw it on its own. So adding an Effect needs no change to the Engine, and the React binding only says which Effects run and which elements are Lamps.

The playground it came from also had Shatter: an element broke into shards and formed again, reversibly. It was dropped before the first release.

## Considered Options

- **Keep Shatter in the Engine**: rejected. It was about a quarter of the code and the only part with state per element: capturing an element on its own, hiding the real one, a mesh, a playhead, handing back to the element at the end. The React side needed mount timing, delays and guards against late callbacks, and the app using it needed extra presence and height handling.
- **Shatter as a second package on top**: deferred. It needs a capture per element that the Engine does not expose; it can come back once there is a reason.

## Consequences

- The Engine draws from one texture, with no layer of its own before the Effects: a frame under `lighting` costs less.
- Leaving and arriving are the app's own animations, Motion's or CSS's; the Canvas draws whatever the HTML shows.
- Shatter is in the git history of `apps/docs/src/client/playground`.
