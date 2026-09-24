---
'laymos': patch
---

Add `laymos skills`, which lists, prints, or installs the shipped `laymos`, `to-laymos`, `domain-modeling`, and `deep-module` agent skills. The shared command builder is exported as `laymos/skills-command`.

Add `loadFolderFiles` and `loadKnownFiles`.

Breaking:

- Flow story sections change from `{ kind: 'flow', flow }` to `{ kind: 'flow', journal }`, the exported `RecordedFlow` schema and type are replaced by `@pkishorez/flow`'s `Journal`, and flows are no longer derived from trace-recorder data.
- The git loaders take a folder in place of a config path.
- Requires `effect@4.0.0-rc.112` instead of `4.0.0-rc.110`.
