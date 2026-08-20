# Encoded & decoded values

Dates go in as dates and come back as dates.

Keys in a single-table design are strings, and some databases have opinions
about what else they will store. Neither is your problem: encoding happens at
the adapter and is undone on the way back, so the notebook works in the types it
declared.
