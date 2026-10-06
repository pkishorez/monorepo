# A Thumb Lock goes sideways into Sections

Status: accepted

A Thumb Lock swipe used to treat any sideways move as a Wrong Way (ADR 0005).
Now a Place can have Sections, such as the tabs of Settings, and the Place
Picker is a cascading menu: moving right on a Place with Sections opens them
beside it, up and down then Step through the Sections, counted from where the
finger turned, and moving left goes back to the Places. Lifting goes to what
is marked. Within one swipe each Place remembers the Section last reached in
it; a new swipe starts afresh. Sideways is still a Wrong Way where there is
nowhere to go.

A Section is reached through a Go Command of its own, so ADR 0001 holds: the
gesture and Cmd K run the same Action.

The picker is a tree of any depth, kept in one module that knows nothing of
Places, Commands or sounds; the shell gives it the tree and what each choice
does.

## Considered options

- **One way per level: up and down for Places, left and right Step through
  Sections as a row.** Rejected: a row of Sections grows sideways off a phone,
  and left as "back" would be lost.
- **Sections navigate by URL instead of a Command.** Rejected: it would break
  ADR 0001, and Cmd K could not find them.
