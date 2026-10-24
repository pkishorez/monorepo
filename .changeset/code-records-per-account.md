---
'code': patch
---

Each Account's records are kept on this device under their own name, `replica:<accountId>:`. When the app opens, the Backend's first list of an Account's Machines keeps only those Machines' records: a Machine gone from the list, forgotten here or elsewhere, and records from an older version of the app are deleted, in every tab. A list that failed deletes nothing, and later lists delete nothing. Forget deletes the Machine's records at once. An Account signed out of this device takes its records with it, and once Accounts are signed in, every other Account's records are deleted. Records kept before they were kept per Account are deleted once and synced again.
