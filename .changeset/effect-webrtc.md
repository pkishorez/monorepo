---
'effect-webrtc': patch
---

Replace the point-in-time Durable peer list with a live `peers` stream. Peer joins and leaves now update each User's private Peer Directory immediately, and the signaling streams recover after Durable Object hibernation. This prevents stale Peer Presence and removes the need for manual directory refreshes.
