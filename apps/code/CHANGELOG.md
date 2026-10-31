# code

## 0.0.1

### Patch Changes

- [#105](https://github.com/pkishorez/monorepo/pull/105) [`680f7e3`](https://github.com/pkishorez/monorepo/commit/680f7e335df5297efa0be14e9108754245ad000d) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Connection status and sending are calmer.

  - Back in the app after a while away, the header says Connecting… in amber, not Connection down, until Cloud Connect answers again; once the Connection is back it says Connected in green for a moment.
  - The line over the Draft saying the server is out of reach, and the green Working… under the transcript, are said only to screen readers now: the header's pill, its dot and the turn's own spinner say it, and the Draft no longer moves.
  - Enter is a new line. Cmd+Enter, or Ctrl+Enter, sends; on a phone, only Send does.
  - Tapping Edit on a phone keeps the Draft's words where they were scrolled to as the keyboard rises.

- [#104](https://github.com/pkishorez/monorepo/pull/104) [`505be9e`](https://github.com/pkishorez/monorepo/commit/505be9ed3cd2e145e14329d66eea419aee3dfcae) Thanks [@kishorenuma](https://github.com/kishorenuma)! - A new Session's page picks the branch it works on, and shows its Starting.

  - The Branch Picker sits beside the model in the Status Line, with the New Worktree toggle: one list in two sections, Local and Origin, a local branch that tracks one on Origin saying so, and that one not listed again. It starts on the branch the Project's folder is on, opens by `shift+b`, a click or a tap, and neither shows for a Project that is not a git repository. The pick is kept in the new session's Saved Draft.
  - Sent, the page shows each step of starting the Session, such as switching the branch, making the Worktree and starting the agent, where the transcript will be. Started, it stays until the Session's page can be drawn whole, so nothing blank comes between them; a refused start, a failed git step included, leaves the Draft, its text and picks as they were, and says why.

- [`43b6ad4`](https://github.com/pkishorez/monorepo/commit/43b6ad40a602cfeaa00dd4887f1843f9aec340fe) Thanks [@pkishorez](https://github.com/pkishorez)! - Settings has an About tab, for this app's version and the data it keeps in this browser.

  - Version shows the Code app's build date and commit, with Check for updates, and Update now once a newer build is downloaded.
  - Storage shows how much this browser holds, and Clear all data deletes it, after asking, and reloads, as on a first visit. Sessions stay on their Connections and the sign-in stays.
  - Under them, centred: Powered by the ke stack logo, linking to its docs.

- [#105](https://github.com/pkishorez/monorepo/pull/105) [`ed6a090`](https://github.com/pkishorez/monorepo/commit/ed6a0900a651755254f33d87903e4cf82de3f012) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Words sent while the agent works show where they were sent, among its work, not under the turn's first message.

- [#105](https://github.com/pkishorez/monorepo/pull/105) [`680f7e3`](https://github.com/pkishorez/monorepo/commit/680f7e335df5297efa0be14e9108754245ad000d) Thanks [@kishorenuma](https://github.com/kishorenuma)! - The Draft on a phone is easier to use.

  - Stop sits inside the Draft, in Send's place, and the round button no longer rubs against the card's corner. Scroll to bottom is a small round arrow.
  - The Draft remembers, per session on this device, whether it was left open, and opens that way again, without the keyboard. Collapsing it by hand drops a selection, leaving the cursor at its end.
  - While a Dictation records, a tap on the collapsed Draft opens it, so its words can be read and the caret placed or text selected.
  - Session actions (⋯) on touch list only the session's own actions, with no keyboard shortcuts.

- [#105](https://github.com/pkishorez/monorepo/pull/105) [`b9743d7`](https://github.com/pkishorez/monorepo/commit/b9743d7e3b0940f20c83c1e97f335ff4c61c7a79) Thanks [@kishorenuma](https://github.com/kishorenuma)! - The Devtools Dock takes `onPhones`. Turned off, a phone gets no corner button and the devtools stay closed, while the page keeps its place. Code turns it off, so the button no longer covers the Draft's Send and Stop on a phone.

- [#105](https://github.com/pkishorez/monorepo/pull/105) [`eb52902`](https://github.com/pkishorez/monorepo/commit/eb5290287ce446387bececbce96c5002d41a3165) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Images a tool gives back, such as a file the agent reads, come through whole, not as `[image]`.

  - ai-toolkit: a `toolResult` Part carries them as `images`, each its media type and base64 data, never cut; its `output` is the text alone.
  - Code: they show as thumbnails under what the tool gave back, each opened whole over the page by a tap.

- Updated dependencies [[`b8eac00`](https://github.com/pkishorez/monorepo/commit/b8eac00499dc3920c3cce10db1187537d459b45b), [`b9743d7`](https://github.com/pkishorez/monorepo/commit/b9743d7e3b0940f20c83c1e97f335ff4c61c7a79), [`30b99d1`](https://github.com/pkishorez/monorepo/commit/30b99d1a28c00bb614a0a5180d05cb4355720eed), [`3e336a0`](https://github.com/pkishorez/monorepo/commit/3e336a09571e36f3934f47935f5864690b959497), [`0346a01`](https://github.com/pkishorez/monorepo/commit/0346a012e50c4c35fabfc9b7a831f91f1469650a), [`eb52902`](https://github.com/pkishorez/monorepo/commit/eb5290287ce446387bececbce96c5002d41a3165)]:
  - @kestack/connect@0.0.6
  - @kestack/web-platform@0.0.6
  - @kestack/kabuki@0.0.5
  - @kestack/std-toolkit@0.0.6
  - @kestack/auth-toolkit@0.0.6
  - @kestack/devtools-kabuki@0.0.16
  - @kestack/rpc-toolkit@0.0.6
  - @kestack/use-keys@0.0.2
