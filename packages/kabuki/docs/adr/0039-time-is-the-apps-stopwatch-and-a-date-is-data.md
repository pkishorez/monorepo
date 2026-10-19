# Time is the app's stopwatch, and a date is data

Time stands still while a Runtime is stopped, so a fork from an earlier Step carries on from that Step's Time and Replay gives the same answer. That makes it wrong for anything in the real world: a session that expires at Time 1:30 is still valid after the server was down two hours, or after a tab was closed for a day. Kabuki keeps Time as it is and recommends, without enforcing it, that a moment in the world is data: whoever Sends the Message puts a real date in it, the Update keeps it, and a Worker waits for it on the real clock, which kept running while the app did not. The one rule stays the one Update always had: it reads nothing but its arguments.

## Considered Options

- **Stamp the real date on every Envelope beside Time, for Update to read**: rejected. A second clock on every entry, a question for every History saved before it, and the same answer a Message's own field gives.
- **Carry Time on from the wall clock when a saved History is loaded**: rejected. Time would jump on a server and not in a browser, a rule harder to explain than "a date is data".
- **A lint rule against `Date.now()` in an Update**: left for when the mistake is seen.

## Consequences

- A server that starts over from what it saved has its real-world deadlines right with no help from Kabuki, as long as they are dates in its Model.
- `at` and `self.now` stay optional: an app that never reads them is unaffected.
