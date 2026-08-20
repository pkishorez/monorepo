# Entities have identity

An entity is an object that other data refers to.

A note is kept under a key. The rest of the notebook uses that key to find it.
One field of the note holds that key.

No step may change that field. A step cannot rename it, remove it, or change its
type. The system adds the field to each version automatically.

This restriction is the feature. It lets a note move through four versions and
stay the same note.
