# Interrupting commands

Status: works. Each upload is a Worker on its row's status, so cancelling
one is setting its status.

## What was ported

Foldkit's `interrupting-commands`: start fake uploads, cancel one, cancel all,
restart a cancelled one.

```
Uploads (root)        Model { nextId, uploads }
                      Worker `upload`, one per upload whose status is Uploading:
                      sleep → SucceededUploadFile → Done
                      ClickedStartUpload → a row with status Uploading
                      ClickedCancelUpload → status Cancelled, so its Worker stops
                      ClickedCancelAllUploads → every Uploading row Cancelled
upload-row/  UploadRow, a drawing of one upload, with a progress bar moved at each Frame
uploads.ts   Schemas, fake files and list changes
```

## Deviations

- **Cancelling is in the Update, with no outcome Message.** Foldkit sends an
  `Interrupt` per upload and gets back `Interrupted` or `NotFound`. Here the
  Update marks the upload Cancelled, which takes it off the Worker's
  Condition, so its Worker's Scope closes; an upload that already finished is
  not Uploading, so there is nothing to stop. Cancel all marks every running
  upload in one Update.
- **A progress bar.** Each upload keeps the Time it started, and the row
  draws how far it has got at each Frame (`useTransform(frame, …)` on a
  `motion.div`), so each Step in Replay shows it at that Message's Time.
  Foldkit pulses instead.
- Uploads sleep on Effect's Clock. Replay does not stop them: the live app
  keeps uploading while a past Step is shown. A Worker started again on a
  resume or a fork reads `self.now` and sleeps only what is left, so it ends
  when the row's bar does.

## Blockers

- None left. Stopping one upload used to need a demo `Uploader` Service
  that kept each upload's fiber by id, then a keyed Command with `cancel`; a
  Worker owned by the row's status replaces both. Keyed Children would also
  fit: an Upload Actor per upload, where cancelling is leaving its Uploading
  State.

## Testing

Foldkit's stories check `Command.expectExact(UploadFile({ uploadId: 0, sizeMegabytes }))`
after a start, resolve it with `SucceededUploadFile`, and resolve the
interrupt `CancelUploadFile({ uploadId })` with
`CompletedCancelUploadFile({ outcome: Interrupted() })` or `NotFound()` to
check both paths. Scenes click Cancel and Restart and read the badges.

What Effect Oak would need:

- A way to see which Workers a Step expects (the Inspector reads them from
  the Snapshot) and to end one by hand with `SucceededUploadFile`.
- A typed `Actor.step` and View drawing from a given Model (blocker 5).
