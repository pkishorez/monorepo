// Analysis judges every import of the FileGraph with this one question.
export { judgeImport } from './import-law.js';
export type { ImportLaw } from './import-law.js';
// Shared Rules become concrete pairs before anything reads them.
export { expandRules } from './import-law.js';
// Project loading rejects a Config the tree cannot hold.
export { validateAgainstTree } from './import-law.js';
// Inspection answers what a node may import.
export { reachOf } from './import-law.js';
export type { Reach } from './import-law.js';
// Loop detection is reused to say whether a wanted import could be a Rule.
export { findRuleLoops, wouldLoop } from './import-law.js';
