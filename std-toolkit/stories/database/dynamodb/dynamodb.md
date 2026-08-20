# DynamoDB

These are the operations that only DynamoDB can do.

They are in order of how much portability each one costs.

- A batch write reduces the number of network calls.
- A native update does arithmetic inside the database.
- A consistent read is a control that only a replicated store has.
- A table definition exists because infrastructure code usually creates DynamoDB
  tables, far from the application.

The last Story shows the raw client. Code that uses it cannot run on another
adapter.
