# Effect WebRTC Demo

Two identified Peers establish a Peer Session and exchange text Messages in
either direction.

## Language

**Peer**:
One endpoint in the conversation. The demo has two Peers, Alice and Bob, and
each may establish a Peer Session with the other or send Messages to the other.
_Avoid_: client, server, user.

**Peer Session**:
The logical one-to-one relationship through which Alice and Bob exchange
Messages. It is distinct from the replaceable connection carrying it.
_Avoid_: chat room, RTC connection.

**Message**:
Immutable text of at most 500 characters, authored by one Peer and addressed to
the other Peer. Messages have no durable existence beyond the current visit.
_Avoid_: RPC, payload, packet.

**Pending Message**:
A Message shown to its author before the receiving Peer has acknowledged it.

**Delivered Message**:
A Message that the receiving Peer has accepted into its local Transcript and
acknowledged. Delivery does not mean durable storage or future replay.

**Failed Message**:
A Message whose delivery attempt ended without an acknowledgement.

**Transcript**:
One Peer's view of the Messages it authored and received during the current
visit. A Transcript survives replacement of the Peer Session but not a page
reload.
_Avoid_: message store, history.

**Flow**:
The diagnostic account of connection establishment or Message delivery across
the two Peer participants.
_Avoid_: event log, debug log.
