# Effect WebRTC Demo

An identified local Peer maintains conversations with multiple remote Peers.
Each conversation uses one Peer Session and exchanges text Messages in either
direction.

## Language

**Peer**:
One endpoint in a conversation. Each running demo represents one local Peer,
which may maintain Peer Sessions with multiple remote Peers.
_Avoid_: client, server, user.

**Peer Identifier**:
The name through which a Peer is reachable within the demo's Signaling
Provider. It is chosen by the visitor and is neither authenticated nor
guaranteed to be unique. It lasts only for the current visit and cannot change
while that Peer is active.
_Avoid_: username, account, Nostr identity.

**Conversation**:
The local view of one remote Peer, its Peer Session status, and the Messages
exchanged through that session.
_Avoid_: client, server, room.

**Negotiation Role**:
Whether a Peer is the selected Initiator or Responder for a Conversation. The
role coordinates connection attempts but does not restrict which Peer may send
Messages.
_Avoid_: client role, server role, sender, receiver.

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
visit. A Transcript survives replacement of the RTC Connection but not a page
reload.
_Avoid_: message store, history.

**Flow**:
The diagnostic account of connection establishment or Message delivery across
the two Peer participants.
_Avoid_: event log, debug log.
