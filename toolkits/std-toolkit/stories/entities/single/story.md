# Single entities

Keep one record, like your app's settings, that always has a value without being created first.

Settings, a profile, a set of preferences: there is exactly one, and code everywhere wants to read it without first checking that it exists.

You give the shape a default:

```ts
const settings = table.singleEntity(Settings).default({ theme: 'light' });
```

[A record never saved reads as its default](std-toolkit/entities/single/an-unsaved-record-reads-as-its-default), and nothing is written until you save. [Put saves the whole record](std-toolkit/entities/single/put-saves-the-whole-record), while [an update merges into the current one](std-toolkit/entities/single/an-update-merges-into-the-current-record). There is no delete: [reset saves the default](std-toolkit/entities/single/reset-saves-the-default) as a real record that subscribers hear.

When the shape changes, [settings saved by the last release read in the new shape](std-toolkit/entities/single/old-settings-read-in-the-new-shape), not as the default. And when a batch depends on the settings you read, [it does not commit if someone changed them meanwhile](std-toolkit/entities/single/a-batch-on-stale-settings-does-not-commit).
