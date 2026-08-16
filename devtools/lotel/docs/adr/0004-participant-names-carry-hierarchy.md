# Participant names carry hierarchy

Participant Names are slash-separated paths, and every shared prefix forms a
Participant Group. We derive this hierarchy from the existing name rather than
adding group metadata to every Flow record, keeping Recorded Flow as the one
portable contract while allowing message destinations and silent Participants
to be grouped without a separate catalog. `/` is reserved for hierarchy because
dots already belong to participant-specific identity grammars such as Std Sync
addresses; hierarchy may have any depth, and a path may name both a Participant
and the group containing its descendants.
