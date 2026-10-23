---
'@kestack/ai-toolkit': patch
---

An app is on every Machine at once (ADR 0018). Each Machine's `Ai` Instance syncs over that Machine's own socket, found by its Key: `AiLive` no longer reads one `AiClient` from context, it asks `AiClients`, which opens one socket per Machine the first time anything holds it and closes it a while after the last lets go. The app gives `MachineAddress`, where each Machine's socket is and its Machine Key, read again before every connect, and builds `AiClients.layer` over it; `AiClients.make` opens each Machine with a Layer of its own, for one server or a test. Any other call reaches one Machine by its id over the same socket: `AiClients.on(machineId, effect)`, `AiClients.stream(machineId, stream)`, `AiClients.machine(machineId)` as a Layer for everything under it, and `AiClients.connection(machineId)` for how its socket stands.
