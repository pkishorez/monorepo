# A Session signs its own requests

Status: accepted

Several Users can be signed in at once, and the shared sign-in service
switches between them for the whole browser: its cookie names whoever is
active now, so another tab or the sign-in service itself can change it under
an open Session. A Session therefore sends its own User's session token as
`Authorization: Bearer` on every `/rpc` call, instead of relying on the
cookie. The server already resolves a bearer token before the cookie, so one
User's sync can never read or write another User's money, and a tab can stay
on a User other than the browser's active one.

## Considered options

- **Rely on the cookie and re-check the User on focus or on a timer.**
  Rejected: Std Sync polls in background tabs, so the gap before a check would
  pull one User's Entries into another's copy, where they stay.
- **Send the User's id beside the cookie and have the server reject a
  mismatch.** Rejected: it repeats who the caller is instead of saying it once,
  and still lets the cookie decide.
