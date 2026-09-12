# Effect WebRTC

Effect WebRTC maintains direct, data-only communication between pairs of identified peers while hiding negotiation and transport recovery from applications.

## Language

**Peer**:
An endpoint that owns a unique Peer Identifier and can maintain sessions with remote peers.
_Avoid_: client, user, device

**Peer Identifier**:
An application-defined value that uniquely addresses one Peer within a Signaling Provider's namespace. Effect WebRTC assigns it no identity or authorization meaning.
_Avoid_: user ID, connection ID

**Peer Session**:
The logical one-to-one relationship between two Peers. It may outlive and replace the underlying WebRTC connection while connection intent remains active.
_Avoid_: room, RTC connection

**Connection Intent**:
A Peer's continuing declaration that a Peer Session with a specified remote Peer should be connected. It remains active through transient failures until explicitly disconnected or its owning Peer is destroyed.
_Avoid_: connection attempt, retry

**Connection Attempt**:
One short-lived negotiation undertaken to satisfy a Connection Intent. A later attempt replaces it rather than reviving its expired signaling messages.
_Avoid_: peer session, connection intent

**Signaling Provider**:
The application-selected service through which Peers address one another and exchange connection-establishment messages. It defines the trust attached to Peer Identifiers and signaling messages.
_Avoid_: signaling server (not every provider is a server)

**Signaling Connection**:
A Peer's connection to its Signaling Provider, through which it exchanges negotiation messages for any of its Peer Sessions.
_Avoid_: Peer Session, RTC Connection

**Platform**:
The host-specific WebRTC capability used by Effect WebRTC. Browser and Node are different Platforms behind the same contract.
_Avoid_: runtime, RTC provider

**RTC Connection**:
The replaceable physical WebRTC connection inside one Peer Session.
_Avoid_: Peer Session, signaling connection

**RTC Data Channel**:
The ordered, reliable WebRTC byte channel owned by an RTC Connection and used to carry RPC messages.
_Avoid_: channel, RPC connection

**RPC Transport**:
The adapter that carries Effect RPC messages over an RTC Data Channel. It does not establish or recover Peer Sessions.
_Avoid_: RPC Session, RPC connection

**Remote Peer**:
The local handle to the other participant in a Peer Session, through which its declared RPC Contract can be invoked.
_Avoid_: client, connection

**Connection Attempt Flow**:
A bounded two-Participant account of one offerer's attempt to establish and use an RTC Connection. The offerer creates its Flow Identifier, the answerer continues it, and transient disconnection remains in it while the same RTC Connection can recover.
_Avoid_: peer session flow, SDP identifier

**RPC Invocation Flow**:
A bounded two-Participant account of one RPC invocation, linked to the Peer Session and Connection Attempt that carried it.
_Avoid_: connection flow, RPC span

**Participant**:
One stable Peer's swim lane in a Flow. Signaling providers, RTC Connections, data channels, and RPC roles are mechanisms rather than Participants.
_Avoid_: connection participant, client lane, server lane

**RPC Provider**:
A Peer capability that implements an RPC Contract for remote Peers to invoke. It does not imply a permanent WebRTC negotiation role.
_Avoid_: WebRTC server, answerer

**RPC Consumer**:
A Peer capability that invokes an RPC Contract implemented by a remote Peer. It does not imply that this Peer initiated the underlying Peer Session.
_Avoid_: WebRTC client, offerer

**Duplex Peer**:
A Peer that is both an RPC Provider and an RPC Consumer over the same Peer Session.
_Avoid_: bidirectional connection, client-server peer

**RPC Contract**:
An Effect RPC group describing the requests, responses, errors, and streams that an RPC Provider exposes to an RPC Consumer.
_Avoid_: data-channel protocol

**Blocked Session**:
A desired Peer Session that cannot currently retry without changed credentials, configuration, or application intervention.
_Avoid_: disconnected session, failed peer

**Data Channel**:
The communication path exposed by a connected Peer Session. Audio and video are outside the context.
_Avoid_: media channel, socket

**Session Recovery**:
Restoring a Peer Session after connectivity loss while preserving its Connection Intent, whether by natural recovery, ICE restart, renegotiation, or replacement of the underlying connection.
_Avoid_: message replay, durable delivery
