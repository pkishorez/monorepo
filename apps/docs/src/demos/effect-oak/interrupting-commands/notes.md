# Interrupting commands

Status: partial. Everything works, but cancelling one upload goes through a
demo Service, because Effect Oak cannot stop one Command.

## What was ported

Foldkit's `interrupting-commands`: start fake uploads, cancel one, cancel all,
restart a cancelled one.

```
Uploads (root)        requires Uploader (from the Layer); Model { nextId, uploads }
                      ClickedStartUpload → Command: Uploader.run(id, sleep) → SucceededUploadFile
                      ClickedCancelUpload → Command: Uploader.cancel(id) → CompletedCancelUploadFile { outcome }
                      ClickedCancelAllUploads → replaceCommands: true, no Commands
uploader/    Uploader Service: run work under an id, cancel it by id
upload-row/  UploadRow, a drawing of one upload, with a progress bar moved at each Frame
uploads.ts   Schemas, fake files and list changes
```

## Deviations

- **Cancel all is `replaceCommands`.** Foldkit sends one `Interrupt` per
  running upload. Here one Update returns no Commands with
  `replaceCommands: true`, which stops every running upload at once, and marks
  them Cancelled in the same Update. No `CompletedCancelUploadFile` follows.
- **A progress bar.** Each upload keeps the Time it started, and the row
  draws how far it has got at each Frame (`useTransform(frame, …)` on a
  `motion.div`), so each Step in Replay shows it at that Message's Time.
  Foldkit pulses instead.
- Uploads sleep on Effect's Clock. Replay does not stop them: the live app
  keeps uploading while a past Step is shown.

## Blockers

- **No way to stop one Command.** `replaceCommands` stops all of a Node's
  Commands; nothing stops one by name or key. The `Uploader` Service fills the
  gap honestly: `run(id, work)` runs the work in a child fiber of the Command
  and keeps it by id, and `cancel(id)` interrupts it and says `Interrupted` or
  `NotFound`, as Foldkit's `Interruptible.Outcome` does. The Command still
  owns the work, so destroying the Node stops it. An API could be keyed
  Commands, `commands: [Command.keyed('upload-3', effect)]`, and an
  Update return `interrupt: ['upload-3']`, with the outcome sent back
  as a Message.
- **No list of Children** (roll-up blocker 1). Each upload would naturally be
  an Upload Node owning its own Command: cancelling it would be leaving its
  Uploading State, and no Service would be needed.

## Testing

Foldkit's stories check `Command.expectExact(UploadFile({ uploadId: 0, sizeMegabytes }))`
after a start, resolve it with `SucceededUploadFile`, and resolve the
interrupt `CancelUploadFile({ uploadId })` with
`CompletedCancelUploadFile({ outcome: Interrupted() })` or `NotFound()` to
check both paths. Scenes click Cancel and Restart and read the badges.

What Effect Oak would need:

- **Named Commands with arguments** to compare and resolve (roll-up
  blocker 4), and a way to see that an Update asked to replace its Commands
  (`replaceCommands` is visible in Update's return today, but only through
  the untyped definition).
- If keyed Commands existed, a test helper to resolve an interrupt with an
  outcome.
- A typed `Node.step` and View drawing from a given Model (blocker 5).
