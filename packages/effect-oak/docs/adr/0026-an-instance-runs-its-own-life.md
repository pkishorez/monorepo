# An Instance runs its own life; the Runtime only starts the root

The Runtime starts one Instance, the root, and hands it every Message. Everything else happens inside the Instance: it decides the next Snapshot, follows it, and runs the Commands asked for. Following its next version, an Instance stops its old State and starts the new one when the State changes, hands new data to its Self and its Workers, and has its Children follow theirs, so every Instance follows itself and the order of those steps never leaves it. A Message reaches its Instance by walking its ID down from the root, one path long; the Runtime keeps no list of Instances.

A State is the stretch of an Instance's life it spends in one State: a Scope inside the Instance's, what the State Provides, and the Children written in it. A State starts Child Instances and an Instance starts its State, so the two live in one module. Workers and Commands never call back up, so each is its own part. What the Runtime gives the Instances it runs is the Host: a way to Send to any Instance through the one Mailbox, the Time, and the app's Layer.

## Considered Options

- **Reconcile from outside, as before**: rejected. The Runtime had to know that leaving a State comes before the new data and entering comes after, so the Instance's life was spread over three files.
- **A State module of its own**: rejected. It would call back into the Instance module to start its Children, so its loop would never close.
- **Keep a map of every living Instance in the Runtime**: rejected. The ID already is the path, and the map would be one more thing to keep in step with the Snapshot.
