/*
 * What the root checks against the disk and the Store, beside its
 * Messages: the Bootstrap Sweep as it loads, and the Folder Check while
 * Ready.
 */

export { sweep } from './sweep.js';
export { check, EVERY, failures } from './folders.js';
