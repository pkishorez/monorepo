# @kestack/capacitor-live-activity

A Capacitor plugin that starts, updates and ends an iOS Live Activity from the page in an app's native shell.

## Big picture

A Live Activity is the card iOS shows on the Lock Screen and in the Dynamic
Island while something is under way. No official Capacitor plugin draws one,
so this is the monorepo's own: a Swift plugin, `LiveActivity`, that the page
reaches through Capacitor's bridge. It is iOS only (16.2 and later; on older
iOS it says it is not supported), and it has no JavaScript: the page calls it
with `registerPlugin('LiveActivity')` from `@capacitor/core`, as
[`@kestack/web-platform`](../../platforms/web-platform)'s `LiveActivity`
Capability does.

The package is a Swift package with two products. `KestackCapacitorLiveActivity`
is the plugin; `cap sync` finds it through the app's `workspace:*` dependency,
as it finds the official plugins, and names it after this package. That name
is the CLI's, so the package and product cannot be renamed. `LiveActivityModel`
holds `LiveActivityAttributes`, the activity's one definition, with no
Capacitor in it: iOS draws the activity in the app's widget extension, which
must link the same type and may only link extension-safe code.

So an app needs three things besides the dependency: `NSSupportsLiveActivities`
in its `Info.plist`, a widget extension that draws `LiveActivityAttributes`
with an `ActivityConfiguration`, and that extension linking `LiveActivityModel`
from this folder. [`capacitor-kabuki-start`](../../apps/capacitor-kabuki-start)
has all three (`ios/App/LiveActivityWidget/`); what it took is in its
[findings](../../apps/capacitor-kabuki-start/docs/findings.md).

## Install

```json
"@kestack/capacitor-live-activity": "workspace:*"
```

- `@capacitor/core` (peer): the bridge the page calls the plugin through. The
  Swift side builds against `capacitor-swift-pm` 8, which `cap sync` pins to
  the app's `@capacitor/ios`.

## Exports

No JavaScript subpath. The plugin answers these calls on the bridge, under
the name `LiveActivity`:

| Export        | What it does                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| `isSupported` | Says whether this iPhone can show a Live Activity: iOS 16.2 or later, and not turned off for the app. |
| `start`       | Starts one with a title, a status line and a progress from 0 to 1, and returns its id.                |
| `update`      | Changes a running one's status line and progress; rejects an id with nothing running.                 |
| `end`         | Ends one at once; an id with nothing running has ended already.                                       |
| `list`        | Lists the app's activities with their ids and states (`active`, `ended`, `dismissed`, `stale`).       |

## Usage

### Start, update and end one from the page

The page registers the plugin by name and calls it; a rejection means iOS
cannot show one or refused it. This is what the web side does, without the
Effect around it.

```ts
import { registerPlugin } from '@capacitor/core';

interface LiveActivity {
  isSupported(): Promise<{ supported: boolean }>;
  start(options: {
    title: string;
    status: string;
    progress?: number;
  }): Promise<{ id: string }>;
  update(options: {
    id: string;
    status: string;
    progress?: number;
  }): Promise<void>;
  end(options: { id: string }): Promise<void>;
}

const liveActivity = registerPlugin<LiveActivity>('LiveActivity');

const { supported } = await liveActivity.isSupported();
if (supported) {
  const { id } = await liveActivity.start({
    title: 'Kabuki Start',
    status: 'Proving the Dynamic Island',
    progress: 0.4,
  });
  await liveActivity.update({ id, status: 'Almost there', progress: 0.9 });
  await liveActivity.end({ id });
}
```

- Never return or await the object `registerPlugin` gives: it is a proxy
  that answers any name, `then` included, with a native call.
- The method types here are written by hand to match the Swift; nothing
  checks one against the other.
- In a debug build, where Capacitor logs, the plugin prints `[live-activity] started <id>
  <state>`, and a line per running activity when the app goes to the
  background; the app's CI reads them.
