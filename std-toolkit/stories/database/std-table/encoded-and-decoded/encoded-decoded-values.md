# Encoded & decoded values

A date goes in as a date. A date comes back as a date.

Keys in this design are strings. Some databases also limit what else they
accept. Neither limit is your problem. The adapter encodes the value on the way
in and decodes it on the way out. Your code uses the types that it declared.
