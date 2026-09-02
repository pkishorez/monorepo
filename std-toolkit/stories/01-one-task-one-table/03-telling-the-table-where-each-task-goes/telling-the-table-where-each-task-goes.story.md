There are two boards now, `work` and `home`, and tasks are about to land on both. The table only knows two key attributes, so someone has to say which part of a task fills each one. This chapter makes that decision once, and every read and write afterwards relies on it.

A task's board becomes the group it is stored in, and its own id becomes its position inside that group. Tasks on the same board therefore sit together, in id order.
