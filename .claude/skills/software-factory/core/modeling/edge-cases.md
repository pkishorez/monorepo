# Common modeling edge cases

**Add a field:** supply a valid value for older records, such as `note: null`.

**Rename or remove a field:** explicitly map old values and explain any loss.

**Change a nested schema:** inspect and check every parent that embeds it.

**Edit stored history:** flag the change and propose a draft or new evolution.

**Read migrated data:** decoding does not rewrite stored rows or populate new index keys.
