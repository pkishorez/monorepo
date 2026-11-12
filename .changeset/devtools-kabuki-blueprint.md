---
'@kestack/devtools-kabuki': patch
'@kestack/devtools': patch
---

The Inspector shows an app's Blueprint beside the app Running, follows one Instance through the History, and walks every Branch of it. DevTools now reads only what Kabuki publishes: the Blueprint, the History and its Branches, Snapshots, Addresses, the Workers the data asks for (`Snapshot.workers`) and the Runtime's Workers, and moves the app only by Seeking and Forking its one Runtime.

**Added**

- `blueprint`, in the Kabuki Session Api: the Blueprint, one node per Child slot, with the Capabilities each level declares it Provides. DevTools forwards it like every other call.
- `Blueprinted`, from `@kestack/devtools-kabuki/api`: the Schema of its answer.
- The Inspector's Running and Blueprint tabs. The Blueprint is drawn whole, a card pressed keeping the way down to it and everything under it in the light, or step by step, a card pressed opening the level under it and closing the one beside it. What is out of the light is dimmed or hidden. A card pressed again opens; Escape lets go. Each tab keeps its own cards open, and the Blueprint has no Timeline.
- `trail`, in the Kabuki Session Api, and a card's Trail in the Inspector: when the Instance started, each Message sent to it, each that changed it, and when it stopped. Picking one Time Travels the app to that Step and zooms back out to the whole tree.
- Branches: `history` and `trail` take `branch`, an entry, and read the Branch through it in place of the Head's; `history` also answers `tips`, every Branch's last entry, and `splits`, each Step on that Branch the History goes on from in more than one way, with every entry that follows it (`Split`, from `@kestack/devtools-kabuki/api`). `devtools kabuki history` takes `--branch <id>`.
- The Inspector's Branch in view: where the History splits at the Step shown, the Timeline offers each entry that follows it, and one picked brings its Branch into view. A Step the app Seeks off the Branch in view brings its Branch into view too.
- At the Head, the Timeline says whether the app is running or stopped.

**Changed**

- Which Workers a Step started or stopped is worked out from the Snapshots before and after it with Kabuki's `Snapshot.workers`, so a past Step shows it too, on each card and in `changes` (`started`, `stopped`).
- IDs are Addresses, and a History entry's `destination` and `source` are `to` and `from`.
- `travel` is `seek`, and `Now`'s and `History`'s `shown` is `seeking`: the app Seeks any entry on any Branch while its Runtime stays where it is, and `null` draws its Head again. The app cannot Seek init, so `seek({ step: 'init' })` fails with `StepNotFound`.
- `fork` moves the app's one Runtime's Head to the entry, so the next Message grows a new Branch, and runs no past Command; nothing re-reads a new Runtime after it. The Timeline's Go live is Go to Head.

**Removed**

- What an app was seen to provide at run time: each level's Capabilities come from its Blueprint.
