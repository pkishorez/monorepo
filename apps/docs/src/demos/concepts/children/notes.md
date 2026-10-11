# 3. Children

A fixed Child is Invoked by a State and lives exactly as long as that State.

The Room has two States, Empty and Occupied. While Occupied it Invokes the
Counter from demo 1 as its Child `counter`.

## Click

- The Room's Circle: Toggle. Empty becomes Occupied and the Counter grows in
  at the end of its Line; Occupied becomes Empty and the Counter shrinks out.
- The Counter's Circle: Increment, as in demo 1.

## Watch

- Leave Occupied and the count is gone: leaving a State stops every Child it
  Invoked. Enter again and a fresh Counter starts at 0.
- In the Strip, the Counter's lane is `Room/counter#1` the first time and
  `Room/counter#2` the next: an Instance Invoked again gets a new ID. A
  Message to the old ID is dropped, drawn as a hollow Marble.
- In the devtools, the Inspector's map shows `counter` under Occupied, dim
  while the Room is Empty; each Toggle's Change lists the Counter starting
  or stopping.
