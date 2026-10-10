# WebSocket chat

Status: works

## What was ported

Foldkit's `websocket-chat`: connect to an echo server, send messages, see
them come back, with errors and a retry.

```
Chat (root)                        requires ChatServer (from the Layer)
  Disconnected
  Online { connected, messages }   Lifetime: ChatServer.connect → Connected / Received / Disconnected / Failed
                                   Provides Conversation
  └─ composer: Composer            requires Conversation; Model { text }; SubmittedMessage → Command → Conversation.send
  Error { error }
chat-server/  ChatServer Capability over a WebSocket: connect (a Stream) and send
composer/     Composer Actor and its View, and the Conversation Capability it requires
transcript/   Transcript, a drawing of the messages
```

Leaving Online interrupts its Lifetime, which closes the socket. The messages
live in Online, so they go when it is left, as Foldkit clears them on
disconnect.

## Deviations

- **Network: the real echo server Foldkit uses**, `wss://ws.postman-echo.com/raw`.
  It needs no key.
- **Connecting and Connected are one State**, `Online`, with `connected`.
  Two States would be two Lifetimes, and the socket would close between them.
- **Timestamps are in the Messages.** Foldkit timestamps each message with a
  separate Command and a `TimestampedMessage`. Here the Lifetime and the send
  read the wall clock and put it in `ReceivedMessage` and
  `SucceededSendMessage`, so Replay shows the same times without a Command.
- The connection timeout sleeps on Effect's Clock, so it runs on while
  Replay shows the past.
- No `ReleasedChatSocket`: a Lifetime cannot send once it is interrupted.

## Blockers

- **A State cannot Provide a resource that an Effect builds** (same as
  [managed-resource-layer](../managed-resource-layer/notes.md)). The open
  socket is kept inside `ChatServer`, whose `send` writes to it, like
  Foldkit's ManagedResource. `provides` is now a Layer built per State, so
  Online could Provide the socket itself; this demo has not moved to that.
- **A Lifetime belongs to exactly one State**, which merged Connecting and
  Connected (same as managed-resource-layer).

## Testing

Foldkit's scenes click Connect, then `ManagedResource.acquire(managedResources.chatSocket)`
to connect, type and send, and resolve `SendMessage` and the timestamp
Commands by hand. `ManagedResource.failAcquire` shows the error, and
`Subscription.emit(ReceivedMessage({ text: 'hello from echo' }))` delivers an
incoming message.

What Effect Oak would need:

- **Emit a Lifetime's Message** in a test (roll-up blocker 6): connecting,
  receiving and failing are all Lifetime Messages here.
- Named Commands (blocker 4) for the Composer's send.
- A fake `ChatServer` Layer already works with `Runtime.start`, as an
  integration test.
