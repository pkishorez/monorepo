# Detect session loss with Data Channel heartbeats

Each connected Peer Session exchanges package-owned ping and pong control frames over its RTC Data Channel. A missing response within `heartbeatTimeout` replaces the RTC Connection when Connection Intent remains active. Effect RPC's existing heartbeat is tied to its Socket protocol and is not used by Effect WebRTC's custom Data Channel protocol; placing liveness below RPC also covers Peer Sessions with no consumed or provided RPC Contract.
