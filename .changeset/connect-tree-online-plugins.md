---
'@kestack/connect': patch
---

`ke-connect serve` runs the Connection as two parts that never see each other: `actor-online`, the tunnel and the Heartbeat, with the tunnel an Actor of its own per generation, and `actor-plugins`, the router and the Plugins. What one learns reaches the other only through the Connection. `ConnectionHost` is split into `Cloud` and `Tunnels`, one outside thing behind each. Who the Connection is (its folders, `connection.json` and Sign-in) moves to `identity/`. Nothing changes for a user.
