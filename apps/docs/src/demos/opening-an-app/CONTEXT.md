# Opening an app

The demo is an app opening in a browser window: it loads its assets, waits for a sign-in, then syncs and downloads files. How it works inside is the Kabuki devtools' job, laid over it. Drawing words only: an Actor, an Instance, a State, a Worker, a Command and a Capability keep their @kstackz/kabuki names.

## Language

**Window**:
The pretend browser the app runs in, sized like a desktop or a phone. The app lays itself out by the Window's width, not the screen's; on a real phone the Window is the whole screen, and reloading it starts the app over.
_Avoid_: frame, device, viewport

**Devtools**:
The Kabuki devtools, full screen over the Window, the app showing through blurred behind them. Ctrl+/ opens and closes them; closing them brings the app back to live from any past Step.
_Avoid_: inspector (the devtools' own word for what they draw), overlay, panel
