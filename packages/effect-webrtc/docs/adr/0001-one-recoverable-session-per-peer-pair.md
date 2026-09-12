# Keep one recoverable session per peer pair

Each pair of Peers shares one logical Peer Session and one active WebRTC connection, even when both Peers provide and consume RPC contracts. RPC direction is independent of WebRTC negotiation direction; multiplexing both directions avoids duplicate connections, divergent recovery loops, and separate lifecycle state while allowing the underlying connection to be replaced during recovery.
