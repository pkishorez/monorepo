# Interrupting commands

Status: works. Each upload is a keyed Command, so one can be cancelled by its
key.

## What was ported

Foldkit's `interrupting-commands`: start fake uploads, cancel one, cancel all,
restart a cancelled one.

```
Uploads (root)        Model { nextId, uploads }
                      ClickedStartUpload → Command `upload-<id>`: sleep → SucceededUploadFile
                      ClickedCancelUpload → Cancelled, cancel: `upload-<id>`
                      ClickedCancelAllUploads → all Cancelled, cancel: every running key
upload-row/  UploadRow, a drawing of one upload, with a progress bar moved at each Frame
uploads.ts   Schemas, fake files and list changes
```

## Deviations

- **Cancelling is in the Update, with no outcome Message.** Foldkit sends an
  `Interrupt` per upload and gets back `Interrupted` or `NotFound`. Here the
  Update cancels the upload's key and marks it Cancelled at once; an upload
  that already finished is not Uploading, so there is nothing to cancel.
  Cancel all cancels every running upload's key in one Update.
- **A progress bar.** Each upload keeps the Time it started, and the row
  draws how far it has got at each Frame (`useTransform(frame, …)` on a
  `motion.div`), so each Step in Replay shows it at that Message's Time.
  Foldkit pulses instead.
- Uploads sleep on Effect's Clock. Replay does not stop them: the live app
  keeps uploading while a past Step is shown.

## Blockers

- None left. Stopping one Command used to need a demo `Uploader` Service
  that kept each upload's fiber by id; keyed Commands and `cancel` replace
  it. Keyed Children would also fit: an Upload Actor per upload, where
  cancelling is leaving its Uploading State.

## Testing

Foldkit's stories check `Command.expectExact(UploadFile({ uploadId: 0, sizeMegabytes }))`
after a start, resolve it with `SucceededUploadFile`, and resolve the
interrupt `CancelUploadFile({ uploadId })` with
`CompletedCancelUploadFile({ outcome: Interrupted() })` or `NotFound()` to
check both paths. Scenes click Cancel and Restart and read the badges.

What Effect Oak would need:

- **Named Commands with arguments** to compare and resolve (roll-up
  blocker 4). The keys and `cancel` are visible in Update's return today.
- A typed `Actor.step` and View drawing from a given Model (blocker 5).
