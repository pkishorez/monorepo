---
'@kstackz/devtools': patch
'@kstackz/lotel': patch
'@kstackz/effect-webrtc': patch
---

DevTools is now three Tools: Lotel, Monoverse, and Laymos. The Flow Tool and the `@kstackz/flow` package are removed, along with the `/flow` route, the `list-flows` and `get-flow` Client Commands, `FlowEntryEntitySchema` from `@kstackz/devtools/rpc`, and the Flow procedures in `DevtoolsRpc`. `devtools snapshot` is removed too, and with it the optional `playwright-core` peer. Lotel's Span and Log Records drop `flowId` and `participantName`, and `get-trace` no longer prints them; records stored with them still read. effect-webrtc traces its sessions with Effect spans instead of Flow Journals.
