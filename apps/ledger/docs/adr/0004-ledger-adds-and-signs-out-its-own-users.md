# Ledger adds and signs out its own Users

Status: accepted

Ledger used to leave adding and signing out Users to the Auth Worker's pages,
reached in a new tab through Manage Google Accounts. That took the user out of
the app for the two things they most often came to the User Switcher for. Now
the User Switcher has Add User, a full-page redirect straight to Google's
account chooser (the same way the first sign-in already works) that comes back
to the same Place with the new User's Session open, and Sign Out for the open
User. Signing every User out is in Settings. Manage Google Accounts is left for
Sessions and Grants only.

## Considered options

- **A popup for Google sign-in.** Rejected: popups are unreliable in an
  installed app on iOS.
- **Sending Add User to the Auth Worker's Login Screen.** Rejected: an extra
  screen between the tap and Google's chooser, which is what this removes.
