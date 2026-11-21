/*
 * What every Coding Harness is run with, on Node: the Harness Binary each
 * one is checked against, the config folder each really uses, and the
 * models each can run, from models.dev. What they give, `Models` and
 * `InvalidBinary`, is in the contract, so a browser can ask for it.
 */

export { checkBinary, configFolderOf } from './binaries.js';
export { modelsLayer, type ModelsOptions } from './models.js';
