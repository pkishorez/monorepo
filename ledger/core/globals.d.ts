// The only globals core may use: what a browser and a phone both have.
// Core is compiled without the DOM and Node libraries, so `window`,
// `document`, `indexedDB` and their kin do not exist here. Add a global only
// when every platform Ledger runs on has it (on Expo, through a polyfill
// if need be).

declare const performance: { now(): number };

declare const crypto: { randomUUID(): string };
