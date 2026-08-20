# DynamoDB

What DynamoDB can do that the portable surface will not.

These are escape hatches, and they are ordered by how much portability each one
costs. Batch writes and native updates amortize or push work into the database.
Consistent reads are a knob only a replicated store has. A table definition
exists because DynamoDB tables are usually provisioned far from application
code.

The last Story is the bottom rung: the raw typed client. Anything written
against it can never run on another adapter.
