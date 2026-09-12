# Close sessions over data and signaling paths

An explicit disconnect sends an acknowledged package control message over the RTC Data Channel before cleanup and also sends the existing signaling Close as a fallback. Closing only through application RPC would not cover Peer Sessions without an RPC Contract, while closing only through an unreliable Signaling Provider could leave the remote Peer reconnecting indefinitely. Unexpected transport loss is not a Close: the Conversation remains recoverable until either Peer explicitly closes it.
