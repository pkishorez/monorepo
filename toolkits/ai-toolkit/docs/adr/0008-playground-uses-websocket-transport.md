# Playground uses WebSocket without binding Run lifetime to it

> **Status:** replay clause superseded by ADR-0010. Reconnecting clients resume through the sync cursor on `_u`, not a chunk sequence.

The Playground Server exposes the composed AI and Playground RPC groups over WebSocket so the browser can keep query and streaming interactions on one reconnectable transport. A dropped socket never cancels its Run: Run lifetime remains owned by the Harness Host, replay remains owned by the Durable Run Log, and a reconnecting client resumes strictly after its last observed sequence.
