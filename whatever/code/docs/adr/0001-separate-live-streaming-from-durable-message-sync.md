# Separate live streaming from durable message sync

Run output is delivered live as AG-UI stream chunks while TanStack AI's
`StreamProcessor` assembles `UIMessage` objects on the server. Messages are
persisted as immutable records only at a terminal Run boundary, then delivered
through database sync; this avoids broadcasting every streaming mutation while
keeping the live execution path responsive and the synchronized transcript
canonical. The terminal-boundary rule applies to stream-assembled messages;
the incoming user message is already complete and is persisted atomically with
the Run at start. Runs are owned by the server and continue when stream consumers
disconnect, so connection loss affects live delivery rather than execution.
