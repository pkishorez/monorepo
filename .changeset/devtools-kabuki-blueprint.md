---
'@kestack/devtools-kabuki': patch
'@kestack/devtools': patch
---

The Inspector shows an app's Blueprint beside the app Running, follows one Instance through the History, and walks every Branch of it. DevTools now reads only what Kabuki publishes: the Blueprint, the History and its Branches, Snapshots, Addresses, the Workers the data asks for (`Snapshot.workers`) and the Runtime's Workers, and moves the app only by Seeking and Forking its one Runtime.

**Added**

- `blueprint`, in the Kabuki Session Api: the Blueprint, one node per Child slot, with the Capabilities each level declares it Provides. DevTools forwards it like every other call.
- `Blueprinted`, from `@kestack/devtools-kabuki/api`: the Schema of its answer.
- The Inspector's Running and Blueprint tabs. The Blueprint is drawn whole, nothing folded or dimmed. A card pressed opens, as in Running; one right clicked opens too and comes to the middle. Each tab keeps its own cards open, and the Blueprint has no Timeline.
- `trail`, in the Kabuki Session Api, and a card's Trail in the Inspector: when the Instance started, each Message sent to it, each that changed it, and when it stopped. Its card's footprints switch follows it: only that card shows, and the Timeline steps, scrubs and plays from moment to moment of it, Time Travelling the app. Pressed again, or the card closed, the whole tree shows again.
- Branches: `history` and `trail` take `branch`, an entry, and read the Branch through it in place of the Head's; `history` also answers `tips`, every Branch's last entry, and `splits`, each Step on that Branch the History goes on from in more than one way, with every entry that follows it (`Split`, from `@kestack/devtools-kabuki/api`). `devtools kabuki history` takes `--branch <id>`.
- The Inspector's Branch in view: where the History splits at the Step shown, the Timeline offers each entry that follows it, and one picked brings its Branch into view. A Step the app Seeks off the Branch in view brings its Branch into view too.
- At the Head, the Timeline says whether the app is running or stopped.

**Changed**

- A card gets each Capability it requires from the nearest card above that Provides it where the card is placed: at its top, or in the State the card lives in. The Blueprint, with no State current, finds them too.

- An open card leaves out Always when it holds nothing, and a State holding nothing is named with nothing to open. In the Blueprint, where no State is current, a card lists every State.

- Which Workers a Step started or stopped is worked out from the Snapshots before and after it with Kabuki's `Snapshot.workers`, so a past Step shows it too, on each card and in `changes` (`started`, `stopped`).
- IDs are Addresses, and a History entry's `destination` and `source` are `to` and `from`.
- `travel` is `seek`, and `Now`'s and `History`'s `shown` is `seeking`: the app Seeks any entry on any Branch while its Runtime stays where it is, and `null` draws its Head again. The app cannot Seek init, so `seek({ step: 'init' })` fails with `StepNotFound`.
- `fork` moves the app's one Runtime's Head to the entry, so the next Message grows a new Branch, and runs no past Command; nothing re-reads a new Runtime after it. The Timeline's Go live is Go to Head.

**Removed**

- What an app was seen to provide at run time: each level's Capabilities come from its Blueprint.
