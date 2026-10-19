# Each user's data lives in their own Durable Object

Every Console record a user owns (GitHub connections, credentials, projects, stages, runs and run events) lives in one Durable Object per user, the User Space, as a `std-toolkit` table on its SQLite storage. The same object serves that user's Console API and Runner API over WebSocket. It is the only writer, so users cannot see each other's data by construction, and `subscribe` streams every change to the user's open tabs with no separate fan-out. The one thing outside it is a D1 index from GitHub installation to user, because a webhook names an installation, not a user.

## Considered Options

- **One shared D1 for all users, with a Durable Object only for live updates.** Rejected: every query would need a user filter to stay safe, and changes would have to be forwarded to the Durable Object by hand.

## Consequences

- When teams arrive, the User Space becomes a team's space with the same shape.
- Loaders cannot read the data in the Worker; they call the User Space's Console API with the visitor's session.
