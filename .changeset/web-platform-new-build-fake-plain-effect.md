---
'@kestack/web-platform': patch
---

`@kestack/web-platform/pwa/fake`: `newBuild` is a Fake made with `@kestack/kabuki/fake`, no Kabuki Actor. Its state is whether a newer build is out; its control `PutOutNewerBuild` puts one out; its Layer gives std-toolkit's `OnOutdated` as before. Breaking: `newBuildOver`, `NewBuildFake`, `NEW_BUILD_CONTROLS`, `blank`, `kept`, `MOVING` and `RELOAD_AFTER` are gone.
