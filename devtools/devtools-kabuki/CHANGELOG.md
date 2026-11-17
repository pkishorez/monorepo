# @kestack/devtools-kabuki

## 0.0.17

### Patch Changes

- [#138](https://github.com/pkishorez/monorepo/pull/138) [`a581f08`](https://github.com/pkishorez/monorepo/commit/a581f085ade3a86e985d75b5ec9ba0724bc14ff0) Thanks [@kishorenuma](https://github.com/kishorenuma)! - The Inspector shows an app's Blueprint beside the app Running, follows one Instance through the History, and walks every Branch of it. DevTools now reads only what Kabuki publishes: the Blueprint, the History and its Branches, Snapshots, Addresses, the Workers the data asks for (`Snapshot.workers`) and the Runtime's Workers, and moves the app only by Seeking and Forking its one Runtime.

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

- Updated dependencies [[`e6bff3f`](https://github.com/pkishorez/monorepo/commit/e6bff3f08491006cbcfa392a68f913a4a0238348), [`5f58fb2`](https://github.com/pkishorez/monorepo/commit/5f58fb2c3a7749326a07fe8c474f532a775c3280), [`aa238be`](https://github.com/pkishorez/monorepo/commit/aa238be43c331c2400846ff49fdd12a0fb199fdf), [`df76ba6`](https://github.com/pkishorez/monorepo/commit/df76ba60280fdb5405ca85b29fe67f8604de18bf), [`af1f892`](https://github.com/pkishorez/monorepo/commit/af1f8924c111d3cdc6fa040ecc2982b3836f5fb9), [`4d4cc1a`](https://github.com/pkishorez/monorepo/commit/4d4cc1a3789e5f5feaf0892b246f04c7caffb983), [`a581f08`](https://github.com/pkishorez/monorepo/commit/a581f085ade3a86e985d75b5ec9ba0724bc14ff0), [`b72f4e7`](https://github.com/pkishorez/monorepo/commit/b72f4e76332cae07b51d0fbe128fff4b06f6f8a6), [`6f65d9b`](https://github.com/pkishorez/monorepo/commit/6f65d9b14a24b5c8728cdf628df1744cfc31857b), [`7cacf4f`](https://github.com/pkishorez/monorepo/commit/7cacf4f346b81da1732fac049ea01c3fcab9af0c), [`4dbf438`](https://github.com/pkishorez/monorepo/commit/4dbf43853ebb2eb47879a8bf73139ccf71ac3909), [`3bd9576`](https://github.com/pkishorez/monorepo/commit/3bd9576b80e3364b23826a4e070f81daec56f3c6), [`4ed2c1a`](https://github.com/pkishorez/monorepo/commit/4ed2c1a126382b68b60392c8aef71c7b0a042046), [`75f0a0b`](https://github.com/pkishorez/monorepo/commit/75f0a0bab4f116611a8c3988e26997b98b7b4e78), [`2678376`](https://github.com/pkishorez/monorepo/commit/2678376efd3ce396d3f491c63c615169112eccd9), [`a581f08`](https://github.com/pkishorez/monorepo/commit/a581f085ade3a86e985d75b5ec9ba0724bc14ff0), [`32c3798`](https://github.com/pkishorez/monorepo/commit/32c379829a355b88722e35efe8eb5f2ffc57fd95), [`2b2e5e5`](https://github.com/pkishorez/monorepo/commit/2b2e5e5d5e8ec705ed0b2fbec34587806030391d), [`d5a56b3`](https://github.com/pkishorez/monorepo/commit/d5a56b3119b67926410d5d8bedf6c2127573e6f3), [`9daf71c`](https://github.com/pkishorez/monorepo/commit/9daf71c79cd51ac7aff2e1e18c71869f2e8bde2f), [`6f65d9b`](https://github.com/pkishorez/monorepo/commit/6f65d9b14a24b5c8728cdf628df1744cfc31857b), [`f71b84b`](https://github.com/pkishorez/monorepo/commit/f71b84b22dbece4a713c0a089251c7337e3e45da), [`aa114fb`](https://github.com/pkishorez/monorepo/commit/aa114fb260fee34c53f51ced868afe6afd5e64b8), [`f9d800a`](https://github.com/pkishorez/monorepo/commit/f9d800a9b107d1c7901c1368893908372cce9074), [`aa114fb`](https://github.com/pkishorez/monorepo/commit/aa114fb260fee34c53f51ced868afe6afd5e64b8)]:
  - @kestack/web-platform@0.0.7
  - @kestack/kabuki@0.0.6

## 0.0.16

### Patch Changes

- Updated dependencies [[`b9743d7`](https://github.com/pkishorez/monorepo/commit/b9743d7e3b0940f20c83c1e97f335ff4c61c7a79), [`85d0632`](https://github.com/pkishorez/monorepo/commit/85d063272beee88e041d0fb0734af2e0a0ceeb68), [`30b99d1`](https://github.com/pkishorez/monorepo/commit/30b99d1a28c00bb614a0a5180d05cb4355720eed), [`daadcde`](https://github.com/pkishorez/monorepo/commit/daadcdebc5f79a7a8b92b4edbb31a6083ff3414a), [`3e336a0`](https://github.com/pkishorez/monorepo/commit/3e336a09571e36f3934f47935f5864690b959497), [`0346a01`](https://github.com/pkishorez/monorepo/commit/0346a012e50c4c35fabfc9b7a831f91f1469650a), [`58b7d35`](https://github.com/pkishorez/monorepo/commit/58b7d354746d54cbea5dcd123ed3f7e7b8cbe321), [`3944cfc`](https://github.com/pkishorez/monorepo/commit/3944cfc821de6202a60dda1b8c9ed40e18ab7de0), [`db868c4`](https://github.com/pkishorez/monorepo/commit/db868c49075e09bf97c3e35bee7a335d5eb359fb)]:
  - @kestack/web-platform@0.0.6
  - @kestack/kabuki@0.0.5
