# How these stories run

Each proof in this part is written one time and runs four times.

It runs against DynamoDB Local over HTTP. It runs against IndexedDB. It runs
against an in-memory SQLite database. It runs against the Memory adapter. Then
it asserts that the four results are the same.

`parity` runs the program four times. `agree` compares the four results. You
will see both in the setup of each Story in this part.

A proof that passes shows two things. It shows that the behaviour is correct. It
also shows that the behaviour is the same on each database.

These Stories describe the harness itself: what runs, how each proof gets a
clean database, how a program selects its database, and the table shape that
they share.
