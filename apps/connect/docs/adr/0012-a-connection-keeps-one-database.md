# A Connection keeps one database, and a migration moves the old files into it

Status: accepted.

Up to 0.0.6, a Connection kept four files in its data folder: `connection.json` (the Connection), `auth.json` (the Auth Worker Connect Cloud last named), `connect.db` (the Sign-in, in auth-toolkit's table) and `wanted.json` (written by 0.0.5, read by nothing). The two JSON files each had a reader of their own, a temporary file and rename to stay whole, and a `chmod` to stay private, and no snapshot checked them. A change to either could leave every computer unable to read what it kept, and no test would say so.

So from 0.0.7 a Connection keeps one file, `ke-connect.db`, created `0600` before SQLite opens it, with two tables:

- `ke-connect`, persistent, with a committed snapshot: the Connection and the Auth Worker, each one row, null until set. Its setup refuses a change that would leave a kept row unreadable, and CI fails first.
- `auth-device-accounts`, auth-toolkit's own table, disposable: the Sign-in. auth-toolkit does not change. A change it makes to the table wipes only that table, so it costs a sign-in, never the Connection.

Each std-toolkit table keeps its own snapshot inside itself, so the two modes live side by side in one file.

The Code Plugin's data, `plugins/code/code.db`, stays where it is.

## The migration

`src/connection/cli/identity/migrations/2026-11-one-database` moves a 0.0.6 folder into `ke-connect.db`. It keeps copies of the old formats instead of importing them: `connection.json` at v1 or v2, and `auth.json`.

1. It runs when any old file is there.
2. If `ke-connect.db` is not there, it builds the file under a temporary name:
   - `VACUUM INTO` copies `connect.db`. SQLite writes the copy whole and consistent, so the Sign-in moves without being read.
   - Then it writes the Connection from `connection.json` and the Auth Worker from `auth.json`.
   - Only the finished file is renamed to `ke-connect.db`.
3. Every time, it deletes the old files: `connection.json`, `auth.json`, `connect.db` (with any `-journal`, `-wal` or `-shm`) and `wanted.json`.

A stop at any point is safe:

- **Before the rename:** nothing has changed, and the next start does it all again.
- **After the rename:** the next start only deletes what is left.

A file that is not there, or cannot be read, moves nothing. A missing Sign-in costs a sign-in, and a missing Connection means a new one.

`serve` runs the migration once it holds the control socket. `remove` runs it after it stops the Connection, so a Connection still in the old layout is forgotten in Connect Cloud too. `list` never runs it, and reading a Connection never creates the file.

Delete the migration folder, and its line in `migrations/index.ts`, once `ke-connect` no longer supports upgrading from before 0.0.7. A folder still in the old layout then keeps its old files unread, and its Connection starts anew.

## Considered options

- **Delete the old files and sign in again.** Simplest, but every User signs in again, and every Connection gets a new id, so Connect Cloud keeps listing the old one offline until it is forgotten from the App.
- **Keep the Sign-in in the `ke-connect` table.** auth-toolkit would have to take any table, and its schema would sit in `ke-connect`'s persistent snapshot. Rejected: a Sign-in is worth only a sign-in. A disposable table of auth-toolkit's own is simpler, and every app that uses auth-toolkit's Device gets it unchanged.
- **Keep the JSON files.** Rejected: they are the only stored data with no snapshot to guard them.

## Consequences

- One file to keep private and one way to check what is kept: every table has a snapshot or is disposable.
- An older `ke-connect` started after 0.0.7 does not see `ke-connect.db`, and would make a new Connection. Going back is not supported. This release raises the Minimum Connect to itself, so Connect Cloud refuses any older `ke-connect`.
- Errors about the Connection no longer name a file: "This Connection is Ada's, not Bob's…", "This Connection is one of `<cloud>`…".
