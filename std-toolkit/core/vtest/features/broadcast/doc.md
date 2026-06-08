# Broadcast: a batch of envelopes on the wire

When a store pushes changes to subscribers — a sync client, a live view — it
doesn't send one record at a time. It sends a **batch**, and the batch needs a
tag so the receiver can recognize it among other messages. That is
`BroadcastSchema`:

```ts
const BroadcastSchema = Schema.Struct({
  _tag: Schema.Literal('@std-toolkit/broadcast'),
  values: Schema.Array(
    Schema.Struct({ meta: MetaSchema, value: Schema.Unknown }),
  ),
});
```

Two design choices stand out:

- **`_tag` is a fixed literal.** The receiver discriminates broadcast messages
  by this exact tag, so a decode either confirms "this is a broadcast" or fails —
  there is no ambiguous middle.
- **`value` is `Schema.Unknown`, but `meta` is `MetaSchema`.** A single broadcast
  can carry many different entity kinds at once, so the values can't share one
  value schema. The _meta_, however, is always the four-key envelope — including
  `_d`, so a broadcast can announce deletions as flagged records rather than by
  omission. The receiver reads `meta._e` to know what each `value` is and decodes
  it with the matching schema.

This is the envelope from the first feature, batched and tagged for transport.

::test-group{id=tagged-batch}
